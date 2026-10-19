import { isDocumentContent } from "@/features/editor/document-sync";
import type { DocumentContent } from "@/features/editor/types";
import { EMPTY_VIEW_CONFIG } from "@/features/databases/database-model";
import type { NewProperty, NewView, ViewChanges } from "@/features/databases/services/database-repository";
import { rewriteImportedBlocks, type LinkTarget, type UploadResult } from "./import-blocks";
import { cleanCell, columnValue, inferColumn, parseCsv, stripPropertyLines, type ImportedColumn } from "./notion-csv";
import {
    planNotionImport,
    resolveExportPath,
    splitTitle,
    titleFromFileName,
    type PlannedDatabase,
} from "./notion-export";

export const IMPORT_ROOT_TITLE = "Notion-Import";

export type ImportDependencies = {
    /** A private page in the current workspace; the parent is a page of this import. */
    createPage(title: string, parentId: string | null, kind?: "page" | "database"): Promise<{ id: string }>;
    saveDocument(pageId: string, content: DocumentContent): Promise<void>;
    uploadFile(pageId: string, file: File): Promise<string>;
    markdownToBlocks(markdown: string): unknown[];
    addProperty(databaseId: string, property: NewProperty): Promise<{ id: string }>;
    setValue(pageId: string, propertyId: string, value: unknown): Promise<void>;
    /** The views of a database; a new one has the server's "Tabelle". */
    listViews(databaseId: string): Promise<{ id: string; position: number }[]>;
    updateView(viewId: string, changes: ViewChanges): Promise<unknown>;
    addView(databaseId: string, view: NewView): Promise<unknown>;
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
    if (plan.skippedInEntries > 0) {
        summary.problems.push(
            `${plan.skippedInEntries} Unterseiten oder Datenbanken in Datenbank-Einträgen nicht übernommen (Einträge haben in Nodi keine Unterseiten)`,
        );
    }

    /** Text, images and attachments of a Markdown page, saved to `pageId`. */
    const importText = async (path: string, pageId: string, body: string, title: string) => {
        const classify = (href: string): LinkTarget => {
            const target = resolveExportPath(path, href)?.normalize("NFC");
            if (!target) return { kind: "web" };
            const lower = target.toLowerCase();
            if (lower.endsWith(".md")) return { kind: "page" };
            if (lower.endsWith(".csv")) return { kind: "database" };
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

        const result = await rewriteImportedBlocks(dependencies.markdownToBlocks(body), classify, upload);
        summary.files += result.files;
        summary.problems.push(...result.problems.map((problem) => `${title}: ${problem}`));
        if (result.blocks.length > 0 && isDocumentContent(result.blocks)) {
            await dependencies.saveDocument(pageId, result.blocks);
        }
    };

    const csvHeader = (path: string) => parseCsv(decoder.decode(archive.get(path)))[0] ?? [];

    /**
     * The export has no views. The exported view's CSV shows which properties
     * it showed; the others are hidden. A board (status or select) and a
     * calendar (date) are added when the database has such a property.
     */
    const addViews = async (
        planned: PlannedDatabase,
        databaseId: string,
        header: string[],
        columns: ImportedColumn[],
        propertyIds: string[],
    ) => {
        const viewHeader = planned.dataPath === planned.path ? null : csvHeader(planned.path);
        const shown = viewHeader && new Set(viewHeader.map((name) => name.trim()));
        const hiddenPropertyIds = shown
            ? propertyIds.filter((_, index) => !shown.has((header[index + 1] ?? "").trim()))
            : [];
        const config = { ...EMPTY_VIEW_CONFIG, hiddenPropertyIds };

        const [table] = await dependencies.listViews(databaseId);
        if (table && hiddenPropertyIds.length > 0) await dependencies.updateView(table.id, { config });
        let position = (table?.position ?? 0) + 1;

        const firstOf = (type: ImportedColumn["type"]) => {
            const index = columns.findIndex((column) => column.type === type);
            return index === -1 ? null : propertyIds[index];
        };
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
        const database = await dependencies.createPage(planned.title, parentId, "database");
        const [header = [], ...rows] = parseCsv(decoder.decode(archive.get(planned.dataPath)));

        // The first column is the title; the others become properties.
        const columns = header.slice(1).map((name, index) =>
            inferColumn(
                name.trim() || `Eigenschaft ${index + 1}`,
                rows.map((row) => cleanCell(row[index + 1] ?? "")),
            ),
        );
        const propertyIds: string[] = [];
        for (const [position, column] of columns.entries()) {
            const property = await dependencies.addProperty(database.id, {
                name: column.name,
                type: column.type,
                options: column.options,
                position,
            });
            propertyIds.push(property.id);
        }
        await addViews(planned, database.id, header, columns, propertyIds);

        // Entry pages by title; a row takes the first one with its title.
        const entryFiles = new Map<string, string[]>();
        for (const path of planned.entryPaths) {
            const title = splitTitle(markdown.get(path) ?? "").title ?? titleFromFileName(path);
            entryFiles.set(title, [...(entryFiles.get(title) ?? []), path]);
        }
        const entries: { title: string; cells: string[]; path: string | null }[] = rows.map((row) => {
            const title = (row[0] ?? "").trim();
            return { title, cells: row.slice(1), path: entryFiles.get(title)?.shift() ?? null };
        });
        // Entry pages without a row (e.g. a CSV of a filtered view).
        for (const [title, paths] of entryFiles) {
            for (const path of paths) entries.push({ title, cells: [], path });
        }

        const columnNames = header.slice(1);
        for (const [index, entry] of entries.entries()) {
            if (dependencies.signal?.aborted) return;
            report(`${planned.title}: Eintrag ${index + 1} von ${entries.length}`);
            const page = await dependencies.createPage(entry.title, database.id);
            await Promise.all(
                columns.flatMap((column, columnIndex) => {
                    const value = columnValue(column, cleanCell(entry.cells[columnIndex] ?? ""));
                    return value === undefined ? [] : [dependencies.setValue(page.id, propertyIds[columnIndex], value)];
                }),
            );
            if (entry.path) {
                const body = stripPropertyLines(splitTitle(markdown.get(entry.path) ?? "").body, columnNames);
                await importText(entry.path, page.id, body, entry.title || "Ohne Titel");
            }
            summary.entries += 1;
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

            const parentId = (planned.parentPath && pageIds.get(planned.parentPath)) || root.id;
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

        dependencies.onProgress?.({ done: total, total, title: "" });
        await dependencies.saveDocument(root.id, rootDocument(summary));
    } catch (error) {
        console.error("Notion-Import abgebrochen:", error);
        summary.error = error instanceof Error ? error.message : "Der Import ist fehlgeschlagen.";
    }
    return summary;
}
