import { isDocumentContent } from "@/features/editor/document-sync";
import type { DocumentContent } from "@/features/editor/types";
import { EMPTY_VIEW_CONFIG } from "@/features/databases/database-model";
import type { NewProperty, NewView, ViewChanges } from "@/features/databases/services/database-repository";
import { TITLE_FIELD, type DatabaseBlockRef, type DatabaseView, type SortRule } from "@/features/databases/types";
import {
    markdownToImportedBlocks,
    rewriteImportedBlocks,
    type DatabaseBlockLink,
    type LinkTarget,
    type UploadResult,
} from "./import-blocks";
import {
    cleanCell,
    columnValue,
    inferColumn,
    parseCsv,
    readPropertyLines,
    relationLinks,
    stripPropertyLines,
    type ImportedColumn,
} from "./notion-csv";
import {
    planNotionImport,
    resolveExportPath,
    splitTitle,
    takeViewSettings,
    titleFromFileName,
    viewSortOf,
    type PlannedDatabase,
} from "./notion-export";

export const IMPORT_ROOT_TITLE = "Notion-Import";

export type ImportDependencies = {
    /** A private page in the current workspace; the parent is a page of this import. `id`: given in advance. */
    createPage(
        title: string,
        parentId: string | null,
        kind?: "page" | "database",
        id?: string,
    ): Promise<{ id: string }>;
    saveDocument(pageId: string, content: DocumentContent): Promise<void>;
    uploadFile(pageId: string, file: File): Promise<string>;
    markdownToBlocks(markdown: string): unknown[];
    addProperty(databaseId: string, property: NewProperty): Promise<{ id: string }>;
    setValue(pageId: string, propertyId: string, value: unknown): Promise<void>;
    /** Both sides of a relation (the server keeps the other side's values equal). */
    addRelation(
        databaseId: string,
        name: string,
        targetDatabaseId: string,
        pairedName: string,
    ): Promise<{ propertyId: string }>;
    /** The views of a database; a new one has the server's "Tabelle". */
    listViews(databaseId: string): Promise<Pick<DatabaseView, "id" | "name" | "type" | "config" | "position">[]>;
    updateView(viewId: string, changes: ViewChanges): Promise<unknown>;
    /** With `block`: a view of a "Datenbank" block in a page (package 19c). */
    addView(databaseId: string, view: NewView, block?: DatabaseBlockRef): Promise<unknown>;
    onProgress?(progress: { done: number; total: number; title: string }): void;
    signal?: AbortSignal;
};

export type ImportSummary = {
    rootPageId: string | null;
    pages: number;
    /** Pages found in the export (without databases and their entries). */
    plannedPages: number;
    databases: number;
    plannedDatabases: number;
    /** Entries of the imported databases. */
    entries: number;
    files: number;
    problems: string[];
    /** Set when the import stopped early; what was imported stays. */
    error: string | null;
    cancelled: boolean;
};

const decoder = new TextDecoder();

// The server's limit for one relation value (package 17d).
const MAX_RELATION_ENTRIES = 100;

type ImportedDatabase = {
    /** `Title <id>.csv` in the export. */
    path: string;
    id: string;
    title: string;
    /** The page of each entry, in order (CSV rows first). */
    entryPageIds: string[];
    /** Property ids by name, the title column as `TITLE_FIELD` (sortings of embedded views name them). */
    propertyIds: Map<string, string>;
};

/** A value of an entry: from the CSV or from the entry's page (links resolve from there). */
type Cell = { text: string; from: string };

/**
 * Properties found only in entry pages. A "Name: Value" line could also be
 * the start of the text: a name counts if two entries have it, or if the
 * lines also hold a property of the CSV.
 */
function pagePropertyNames(csvNames: ReadonlySet<string>, pageProperties: readonly { name: string }[][]): string[] {
    const counts = new Map<string, number>();
    const confirmed = new Set<string>();
    for (const lines of pageProperties) {
        const withCsv = lines.some((line) => csvNames.has(line.name));
        for (const name of new Set(lines.map((line) => line.name))) {
            if (csvNames.has(name)) continue;
            counts.set(name, (counts.get(name) ?? 0) + 1);
            if (withCsv) confirmed.add(name);
        }
    }
    return [...counts].flatMap(([name, count]) => (count >= 2 || confirmed.has(name) ? [name] : []));
}

type RelationColumn = {
    database: ImportedDatabase;
    name: string;
    /** The linked database in the export. */
    targetPath: string;
    /** Linked entry files, per entry. */
    links: string[][];
};

const text = (value: string) => ({ type: "text" as const, text: value, styles: {} });

function rootDocument(summary: ImportSummary): DocumentContent {
    const date = new Date().toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
    const databases = summary.databases === 1 ? "1 Datenbank" : `${summary.databases} Datenbanken`;
    return [
        {
            type: "paragraph",
            content: [text(`Aus Notion importiert am ${date}: ${summary.pages} Seiten und ${databases}.`)],
        },
    ];
}

/**
 * Imports a Notion export (CLAUDE.md §12 P16): a private page "Notion-Import"
 * with the exported pages and databases below it, in Notion's order, with
 * their text, images and attachments; database entries with their values.
 * Everything is created one after another and needs the server; a failure
 * stops the import, what was imported stays.
 */
export async function importNotionExport(
    archive: ReadonlyMap<string, Uint8Array>,
    dependencies: ImportDependencies,
): Promise<ImportSummary> {
    const markdown = new Map<string, string>();
    for (const [path, data] of archive) {
        if (path.toLowerCase().endsWith(".md")) markdown.set(path, decoder.decode(data));
    }
    const plan = planNotionImport(markdown, archive.keys());

    // Pages link the databases shown in them; their ids are fixed in advance,
    // as a page's text is saved before the databases below it exist.
    const databaseIds = new Map<string, string>();
    for (const item of plan.items) {
        if (item.kind !== "database") continue;
        const id = crypto.randomUUID();
        databaseIds.set(item.path, id);
        databaseIds.set(item.dataPath, id);
    }
    // "Datenbank" blocks made from those links; they get the database's views at the end.
    const databaseBlocks: (DatabaseBlockRef & DatabaseBlockLink)[] = [];

    const summary: ImportSummary = {
        rootPageId: null,
        pages: 0,
        plannedPages: plan.items.filter((item) => item.kind === "page").length,
        databases: 0,
        plannedDatabases: plan.items.filter((item) => item.kind === "database").length,
        entries: 0,
        files: 0,
        problems: [],
        error: null,
        cancelled: false,
    };
    if (plan.items.length === 0) {
        summary.error = "Im Export wurden keine Seiten gefunden. Bitte in Notion „Markdown & CSV“ wählen.";
        return summary;
    }

    /** Text, images and attachments of a Markdown page, saved to `pageId`. */
    const importText = async (path: string, pageId: string, body: string, title: string) => {
        const { markdown: text, sorts } = takeViewSettings(body);
        // Notion leaves out some linked databases (e.g. views of databases outside the export).
        const missingDatabases = new Set<string>();
        const classify = (href: string): LinkTarget => {
            const target = resolveExportPath(path, href)?.normalize("NFC");
            if (!target) return { kind: "web" };
            const lower = target.toLowerCase();
            if (lower.endsWith(".md")) return { kind: "page" };
            if (lower.endsWith(".csv")) {
                // A view embedded in a page is a copy of the database's CSV: the block shows the database.
                const databaseId = databaseIds.get(plan.databaseCopies.get(target) ?? target) ?? null;
                if (!archive.has(target)) missingDatabases.add(titleFromFileName(target));
                return { kind: "database", databaseId, sort: viewSortOf(href, sorts) };
            }
            return archive.has(target) ? { kind: "file", path: target } : { kind: "missing", path: target };
        };
        const upload = async (filePath: string): Promise<UploadResult> => {
            const data = archive.get(filePath);
            if (!data) return { error: "nicht im Export enthalten" };
            try {
                const file = new File([new Uint8Array(data)], filePath.split("/").pop() ?? "datei");
                return { reference: await dependencies.uploadFile(pageId, file) };
            } catch (error) {
                return { error: error instanceof Error ? error.message : "Hochladen fehlgeschlagen" };
            }
        };

        const result = await rewriteImportedBlocks(
            markdownToImportedBlocks(text, dependencies.markdownToBlocks),
            classify,
            upload,
        );
        databaseBlocks.push(...result.databaseBlocks.map((block) => ({ ...block, pageId })));
        summary.files += result.files;
        summary.problems.push(...result.problems.map((problem) => `${title}: ${problem}`));
        for (const name of missingDatabases) {
            summary.problems.push(`${title}: Datenbank „${name}“ fehlt im Export, nur ihr Name wurde übernommen`);
        }
        if (result.blocks.length > 0 && isDocumentContent(result.blocks)) {
            await dependencies.saveDocument(pageId, result.blocks);
        }
    };

    const csvHeader = (path: string) => parseCsv(decoder.decode(archive.get(path)))[0] ?? [];

    // Relations link entries of databases of this export; they are created
    // after all databases, when the linked entries exist.
    const databaseOfEntry = new Map<string, string>();
    for (const item of plan.items) {
        if (item.kind === "database") for (const path of item.entryPaths) databaseOfEntry.set(path, item.path);
    }
    const importedDatabases = new Map<string, ImportedDatabase>();
    const relationColumns: RelationColumn[] = [];
    const pageIdOfEntry = new Map<string, string>();

    /** A column whose cells only link entries of one database of the export is a relation to it. */
    const relationTarget = (cells: (Cell | undefined)[]): Pick<RelationColumn, "targetPath" | "links"> | null => {
        const links = cells.map((cell) => (cell ? relationLinks(cell.text, cell.from) : []));
        const filled = cells.flatMap((cell, entry) => (cell?.text.trim() ? [links[entry]] : []));
        if (filled.length === 0 || filled.some((rowLinks) => rowLinks.length === 0)) return null;
        const targets = new Set(links.flat().map((path) => databaseOfEntry.get(path)));
        const [targetPath] = targets;
        return targets.size === 1 && typeof targetPath === "string" ? { targetPath, links } : null;
    };

    const importRelations = async () => {
        const done = new Set<RelationColumn>();
        for (const column of relationColumns) {
            if (done.has(column)) continue;
            done.add(column);
            const target = importedDatabases.get(column.targetPath);
            if (!target) {
                summary.problems.push(
                    `${column.database.title}: Verknüpfung „${column.name}“ nicht übernommen (die verknüpfte Datenbank wurde nicht importiert)`,
                );
                continue;
            }
            // Notion exports both sides of a two-way relation: the other one becomes the paired property.
            const partner = relationColumns.find(
                (other) =>
                    !done.has(other) &&
                    other.database.path === column.targetPath &&
                    other.targetPath === column.database.path,
            );
            if (partner) done.add(partner);
            const { propertyId } = await dependencies.addRelation(
                column.database.id,
                column.name,
                target.id,
                partner?.name ?? column.database.title,
            );
            column.database.propertyIds.set(column.name, propertyId);
            // The links of both columns, set on this side only: the server links the other side.
            const linked = new Map<string, Set<string>>();
            const addLink = (from: string | undefined, to: string | undefined) => {
                if (!from || !to) return;
                linked.set(from, (linked.get(from) ?? new Set()).add(to));
            };
            for (const [row, links] of column.links.entries()) {
                for (const path of links) addLink(column.database.entryPageIds[row], pageIdOfEntry.get(path));
            }
            for (const [row, links] of partner?.links.entries() ?? []) {
                for (const path of links) addLink(pageIdOfEntry.get(path), partner?.database.entryPageIds[row]);
            }
            for (const [pageId, ids] of linked) {
                await dependencies.setValue(pageId, propertyId, [...ids].slice(0, MAX_RELATION_ENTRIES));
            }
        }
    };

    /**
     * The export has no views. The exported view's CSV shows which properties
     * it showed; the others are hidden. A board (status or select) and a
     * calendar (date) are added when the database has such a property.
     */
    const addViews = async (
        planned: PlannedDatabase,
        databaseId: string,
        // The names of the CSV's columns; properties from entry pages come after them.
        csvNames: string[],
        columns: ImportedColumn[],
        // null: a relation, created later.
        propertyIds: (string | null)[],
    ) => {
        // Newer exports have only `…_all.csv`: nothing is hidden.
        const viewHeader =
            planned.dataPath !== planned.path && archive.has(planned.path) ? csvHeader(planned.path) : null;
        const shown = viewHeader && new Set(viewHeader.map((name) => name.trim()));
        const hiddenPropertyIds = shown
            ? propertyIds.flatMap((id, index) =>
                  id && index < csvNames.length && !shown.has(csvNames[index]) ? [id] : [],
              )
            : [];
        const config = { ...EMPTY_VIEW_CONFIG, hiddenPropertyIds };

        const [table] = await dependencies.listViews(databaseId);
        if (table && hiddenPropertyIds.length > 0) await dependencies.updateView(table.id, { config });
        let position = (table?.position ?? 0) + 1;

        const firstOf = (type: ImportedColumn["type"]) =>
            propertyIds.find((id, index) => id !== null && columns[index].type === type) ?? null;
        const groupBy = firstOf("status") ?? firstOf("select");
        if (groupBy) {
            const view = { ...config, groupByPropertyId: groupBy };
            await dependencies.addView(databaseId, { name: "Board", type: "board", config: view, position });
            position += 1;
        }
        const date = firstOf("date");
        if (date) {
            const view = { ...config, datePropertyId: date };
            await dependencies.addView(databaseId, { name: "Kalender", type: "calendar", config: view, position });
        }
    };

    const importDatabase = async (planned: PlannedDatabase, parentId: string, report: (title: string) => void) => {
        const database = await dependencies.createPage(
            planned.title,
            parentId,
            "database",
            databaseIds.get(planned.path),
        );
        const [header = [], ...rows] = parseCsv(decoder.decode(archive.get(planned.dataPath)));
        const csvNames = header.slice(1).map((name, index) => name.trim() || `Eigenschaft ${index + 1}`);

        // Entry pages by title; a row takes the first one with its title.
        const entryFiles = new Map<string, string[]>();
        for (const path of planned.entryPaths) {
            const title = splitTitle(markdown.get(path) ?? "").title ?? titleFromFileName(path);
            entryFiles.set(title, [...(entryFiles.get(title) ?? []), path]);
        }
        const entries: { title: string; path: string | null; cells: Map<string, Cell> }[] = rows.map((row) => {
            const title = (row[0] ?? "").trim();
            const cells = new Map(
                csvNames.map((name, index) => [name, { text: row[index + 1] ?? "", from: planned.dataPath }]),
            );
            return { title, path: entryFiles.get(title)?.shift() ?? null, cells };
        });
        const rowCount = entries.length;
        // Entry pages without a row (e.g. a CSV of a filtered view).
        for (const [title, paths] of entryFiles) {
            for (const path of paths) entries.push({ title, path, cells: new Map() });
        }

        // Newer exports leave relations, rollups and formulas out of the CSV; the entry pages have them.
        const pageProperties = entries.map((entry) =>
            entry.path ? readPropertyLines(splitTitle(markdown.get(entry.path) ?? "").body) : [],
        );
        const extraNames = pagePropertyNames(new Set(csvNames), pageProperties);
        for (const [index, entry] of entries.entries()) {
            for (const { name, value } of pageProperties[index]) {
                // The CSV's value wins; entries without a row take all of their page's values.
                if (entry.path && (extraNames.includes(name) || (index >= rowCount && csvNames.includes(name)))) {
                    entry.cells.set(name, { text: value, from: entry.path });
                }
            }
        }
        const names = [...csvNames, ...extraNames];

        // The first column is the title; the others become properties.
        const columns = names.map((name) =>
            inferColumn(
                name,
                entries.map((entry) => cleanCell(entry.cells.get(name)?.text ?? "")),
            ),
        );
        const relations = names.map((name) => relationTarget(entries.map((entry) => entry.cells.get(name))));
        const imported: ImportedDatabase = {
            path: planned.path,
            id: database.id,
            title: planned.title,
            entryPageIds: [],
            propertyIds: new Map([[(header[0] ?? "").trim(), TITLE_FIELD]]),
        };
        importedDatabases.set(planned.path, imported);

        const propertyIds: (string | null)[] = [];
        for (const [position, column] of columns.entries()) {
            const relation = relations[position];
            if (relation) {
                relationColumns.push({ database: imported, name: column.name, ...relation });
                propertyIds.push(null);
                continue;
            }
            const property = await dependencies.addProperty(database.id, {
                name: column.name,
                type: column.type,
                options: column.options,
                ...(column.type === "number" && column.numberFormat !== "number"
                    ? { numberFormat: column.numberFormat }
                    : {}),
                position,
            });
            propertyIds.push(property.id);
            imported.propertyIds.set(column.name, property.id);
        }
        await addViews(planned, database.id, csvNames, columns, propertyIds);

        for (const [index, entry] of entries.entries()) {
            if (dependencies.signal?.aborted) return;
            report(`${planned.title}: Eintrag ${index + 1} von ${entries.length}`);
            const page = await dependencies.createPage(entry.title, database.id);
            // In order: relations find their entries by index.
            imported.entryPageIds.push(page.id);
            if (entry.path) pageIdOfEntry.set(entry.path, page.id);
            await Promise.all(
                columns.flatMap((column, columnIndex) => {
                    const propertyId = propertyIds[columnIndex];
                    const value = columnValue(column, cleanCell(entry.cells.get(names[columnIndex])?.text ?? ""));
                    return value === undefined || !propertyId
                        ? []
                        : [dependencies.setValue(page.id, propertyId, value)];
                }),
            );
            if (entry.path) {
                const body = stripPropertyLines(splitTitle(markdown.get(entry.path) ?? "").body, names);
                await importText(entry.path, page.id, body, entry.title || "Ohne Titel");
            }
            summary.entries += 1;
        }
    };

    /**
     * A database in a page shows the views of the database, as in Notion (they
     * can be changed per block), sorted like the embedded view if it says so.
     */
    const copyViewsToBlocks = async () => {
        const imported = new Map([...importedDatabases.values()].map((database) => [database.id, database]));
        for (const block of databaseBlocks) {
            const database = imported.get(block.databaseId);
            // Not imported (stopped early): the block says the database is not available.
            if (!database) continue;
            const sort = block.sort.flatMap((rule): SortRule[] => {
                const propertyId = database.propertyIds.get(rule.name);
                return propertyId ? [{ propertyId, direction: rule.direction }] : [];
            });
            for (const view of await dependencies.listViews(block.databaseId)) {
                const { name, type, position } = view;
                const config = sort.length > 0 ? { ...view.config, sort } : view.config;
                await dependencies.addView(
                    block.databaseId,
                    { name, type, config, position },
                    { pageId: block.pageId, blockId: block.blockId },
                );
            }
        }
    };

    try {
        const root = await dependencies.createPage(IMPORT_ROOT_TITLE, null);
        summary.rootPageId = root.id;
        const pageIds = new Map<string, string>();
        const total = plan.items.length;

        for (const [index, planned] of plan.items.entries()) {
            if (dependencies.signal?.aborted) {
                summary.cancelled = true;
                break;
            }
            const report = (title: string) => dependencies.onProgress?.({ done: index, total, title });
            report(planned.title);

            // The parent is a page or an entry of a database (its subpages, package 23).
            const parentId =
                (planned.parentPath && (pageIds.get(planned.parentPath) ?? pageIdOfEntry.get(planned.parentPath))) ||
                root.id;
            if (planned.kind === "database") {
                await importDatabase(planned, parentId, report);
                summary.databases += 1;
                // Stopped between entries: the database stays with what it has.
                if (dependencies.signal?.aborted) {
                    summary.cancelled = true;
                    break;
                }
                continue;
            }

            const page = await dependencies.createPage(planned.title, parentId);
            pageIds.set(planned.path, page.id);
            await importText(planned.path, page.id, splitTitle(markdown.get(planned.path) ?? "").body, planned.title);
            summary.pages += 1;
        }

        if (relationColumns.length > 0) dependencies.onProgress?.({ done: total, total, title: "Verknüpfungen" });
        await importRelations();
        await copyViewsToBlocks();
        dependencies.onProgress?.({ done: total, total, title: "" });
        await dependencies.saveDocument(root.id, rootDocument(summary));
    } catch (error) {
        console.error("Notion-Import abgebrochen:", error);
        summary.error = error instanceof Error ? error.message : "Der Import ist fehlgeschlagen.";
    }
    return summary;
}
