import { strToU8 } from "fflate";
import { fileNameOfPath } from "@/features/files/file-reference";
import type { Page } from "@/features/pages/types";
import { pageMarkdown, type BlocksToMarkdown, type ExportLinks } from "./export-markdown";
import { planExport, relativeHref, type ExportItem } from "./export-tree";

export type ExportSources = {
    /** The page's blocks: the copy on this device if there is one (it may be newer), else the server's. */
    loadDocument: (pageId: string) => Promise<readonly unknown[]>;
    downloadFile: (storagePath: string) => Promise<Uint8Array>;
    blocksToMarkdown: BlocksToMarkdown;
};

export type ExportProgress = { done: number; total: number; title: string };

export type ExportResult = {
    /** Path in the ZIP file → content. */
    files: Map<string, Uint8Array>;
    pages: number;
    attachments: number;
    /** Nothing is left out silently: what could not be exported. */
    problems: string[];
};

/** The files of an export of the given pages and everything below them (package 34a). */
export async function buildExport(
    pages: readonly Page[],
    rootIds: readonly string[],
    sources: ExportSources,
    onProgress: (progress: ExportProgress) => void = () => undefined,
): Promise<ExportResult> {
    const plan = planExport(pages, rootIds);
    const byId = new Map(plan.map((item) => [item.page.id, item]));
    const pageItems = plan.filter((item) => item.page.kind === "page");
    const files = new Map<string, Uint8Array>();
    const problems: string[] = [];
    let attachments = 0;

    const linksFor = (item: ExportItem, downloads: Map<string, string>): ExportLinks => {
        const linkTo = (id: string, kind: Page["kind"]) => {
            const target = byId.get(id);
            return target && target.page.kind === kind
                ? { href: relativeHref(item.path, target.path), title: target.page.title }
                : null;
        };
        const names = new Set<string>();
        return {
            page: (id) => linkTo(id, "page"),
            database: (id) => linkTo(id, "database"),
            file: (storagePath) => {
                let target = downloads.get(storagePath);
                if (!target) {
                    // Two files of the same name in one page: "bild.png", "bild (2).png".
                    const name = fileNameOfPath(storagePath);
                    let unique = name;
                    for (let count = 2; names.has(unique); count += 1) {
                        unique = name.replace(/(\.[^.]*)?$/, (extension) => ` (${count})${extension}`);
                    }
                    names.add(unique);
                    target = `${item.folder}/${unique}`;
                    downloads.set(storagePath, target);
                }
                return relativeHref(item.path, target);
            },
        };
    };

    for (const [index, item] of pageItems.entries()) {
        onProgress({ done: index, total: pageItems.length, title: item.page.title });
        const downloads = new Map<string, string>();
        let document: readonly unknown[] = [];
        try {
            document = await sources.loadDocument(item.page.id);
        } catch (error) {
            console.error("Export: Seite konnte nicht geladen werden:", error);
            problems.push(`${item.page.title || "Ohne Titel"}: Text konnte nicht geladen werden`);
        }
        let markdown: string;
        try {
            markdown = pageMarkdown(item.page.title, document, linksFor(item, downloads), sources.blocksToMarkdown);
        } catch (error) {
            console.error("Export: Text konnte nicht umgewandelt werden:", error);
            problems.push(`${item.page.title || "Ohne Titel"}: Text konnte nicht umgewandelt werden`);
            markdown = pageMarkdown(item.page.title, [], linksFor(item, downloads), sources.blocksToMarkdown);
            downloads.clear();
        }
        files.set(item.path, strToU8(markdown));

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
    }
    onProgress({ done: pageItems.length, total: pageItems.length, title: "" });

    const databases = plan.length - pageItems.length;
    if (databases > 0) {
        problems.push(
            databases === 1
                ? "1 Datenbank wurde nicht exportiert: Datenbanken kann nodi noch nicht exportieren."
                : `${databases} Datenbanken wurden nicht exportiert: Datenbanken kann nodi noch nicht exportieren.`,
        );
    }
    return { files, pages: pageItems.length, attachments, problems };
}
