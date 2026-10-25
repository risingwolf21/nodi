import { strToU8 } from "fflate";
import { buildRows } from "@/features/databases/database-model";
import type { DatabaseData } from "@/features/databases/types";
import { fileNameOfPath } from "@/features/files/file-reference";
import { compareByPosition } from "@/features/pages/page-hierarchy";
import type { Page } from "@/features/pages/types";
import { databaseCsv } from "./export-csv";
import { pageMarkdown, type BlocksToMarkdown, type ExportLinks } from "./export-markdown";
import { planExport, relativeHref, type ExportItem } from "./export-tree";

export type ExportSources = {
    /** The page's blocks: the copy on this device if there is one (it may be newer), else the server's. */
    loadDocument: (pageId: string) => Promise<readonly unknown[]>;
    /** Properties, values and views of a database, from the server. */
    loadDatabase: (databaseId: string) => Promise<DatabaseData>;
    downloadFile: (storagePath: string) => Promise<Uint8Array>;
    blocksToMarkdown: BlocksToMarkdown;
};

export type ExportProgress = { done: number; total: number; title: string };

export type ExportResult = {
    /** Path in the ZIP file → content. */
    files: Map<string, Uint8Array>;
    pages: number;
    databases: number;
    attachments: number;
    /** Nothing is left out silently: what could not be exported. */
    problems: string[];
};

/** The files of an export of the given pages and everything below them (packages 34a, 34b). */
export async function buildExport(
    pages: readonly Page[],
    rootIds: readonly string[],
    sources: ExportSources,
    onProgress: (progress: ExportProgress) => void = () => undefined,
): Promise<ExportResult> {
    const plan = planExport(pages, rootIds);
    const byId = new Map(plan.map((item) => [item.page.id, item]));
    const pageItems = plan.filter((item) => item.page.kind === "page");
    const databaseItems = plan.filter((item) => item.page.kind === "database");
    const total = plan.length;
    const files = new Map<string, Uint8Array>();
    const problems: string[] = [];
    let attachments = 0;

    // Files go into the folder of their page; two of the same name there: "bild.png", "bild (2).png".
    const downloads = new Map<string, string>();
    const namesByFolder = new Map<string, Set<string>>();
    const placeFile = (folder: string, storagePath: string): string => {
        const placed = downloads.get(storagePath);
        if (placed) return placed;
        const names = namesByFolder.get(folder) ?? new Set<string>();
        namesByFolder.set(folder, names);
        const name = fileNameOfPath(storagePath);
        let unique = name;
        for (let count = 2; names.has(unique); count += 1) {
            unique = name.replace(/(\.[^.]*)?$/, (extension) => ` (${count})${extension}`);
        }
        names.add(unique);
        downloads.set(storagePath, `${folder}/${unique}`);
        return `${folder}/${unique}`;
    };

    const linksFor = (item: ExportItem): ExportLinks => {
        const linkTo = (id: string, kind: Page["kind"]) => {
            const target = byId.get(id);
            return target && target.page.kind === kind
                ? { href: relativeHref(item.path, target.path), title: target.page.title }
                : null;
        };
        return {
            page: (id) => linkTo(id, "page"),
            database: (id) => linkTo(id, "database"),
            file: (storagePath) => relativeHref(item.path, placeFile(item.folder, storagePath)),
        };
    };

    const fetchDownloads = async () => {
        // One after another: keeps the connection and memory calm for large exports.
        for (const [storagePath, target] of downloads) {
            try {
                files.set(target, await sources.downloadFile(storagePath));
                attachments += 1;
            } catch (error) {
                console.error("Export: Datei konnte nicht geladen werden:", error);
                problems.push(`${fileNameOfPath(storagePath)}: Datei konnte nicht geladen werden`);
            }
        }
        downloads.clear();
    };

    let done = 0;
    for (const item of pageItems) {
        onProgress({ done: done++, total, title: item.page.title });
        let document: readonly unknown[] = [];
        try {
            document = await sources.loadDocument(item.page.id);
        } catch (error) {
            console.error("Export: Seite konnte nicht geladen werden:", error);
            problems.push(`${item.page.title || "Ohne Titel"}: Text konnte nicht geladen werden`);
        }
        let markdown: string;
        try {
            markdown = pageMarkdown(item.page.title, document, linksFor(item), sources.blocksToMarkdown);
        } catch (error) {
            console.error("Export: Text konnte nicht umgewandelt werden:", error);
            problems.push(`${item.page.title || "Ohne Titel"}: Text konnte nicht umgewandelt werden`);
            markdown = pageMarkdown(item.page.title, [], linksFor(item), sources.blocksToMarkdown);
        }
        files.set(item.path, strToU8(markdown));
        await fetchDownloads();
    }

    let databases = 0;
    for (const item of databaseItems) {
        onProgress({ done: done++, total, title: item.page.title });
        // Rows in the order of the database: the import gives the entries their positions from it.
        const entries = pages
            .filter((page) => page.parent_id === item.page.id && !page.is_template)
            .sort(compareByPosition);
        try {
            const data = await sources.loadDatabase(item.page.id);
            const csv = databaseCsv(data.properties, buildRows(entries, data), {
                entry: (id) => {
                    const target = byId.get(id);
                    return target ? { title: target.page.title, href: relativeHref(item.path, target.path) } : null;
                },
                // A file of an entry goes into the entry's folder, like a file in its text; the cell links to it.
                file: (entryId, storagePath) => {
                    const entry = byId.get(entryId);
                    return entry
                        ? relativeHref(item.path, placeFile(entry.folder, storagePath))
                        : fileNameOfPath(storagePath);
                },
            });
            files.set(item.path, strToU8(csv));
            databases += 1;
        } catch (error) {
            console.error("Export: Datenbank konnte nicht geladen werden:", error);
            problems.push(`${item.page.title || "Ohne Titel"}: Datenbank konnte nicht geladen werden`);
        }
        await fetchDownloads();
    }
    onProgress({ done: total, total, title: "" });

    return { files, pages: pageItems.length, databases, attachments, problems };
}
