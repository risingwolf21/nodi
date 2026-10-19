import { isDocumentContent } from "@/features/editor/document-sync";
import type { DocumentContent } from "@/features/editor/types";
import { rewriteImportedBlocks, type LinkTarget, type UploadResult } from "./import-blocks";
import { planNotionImport, resolveExportPath, splitTitle, type SkippedDatabase } from "./notion-export";

export const IMPORT_ROOT_TITLE = "Notion-Import";

export type ImportDependencies = {
    /** A private page in the current workspace; the parent is a page of this import. */
    createPage(title: string, parentId: string | null): Promise<{ id: string }>;
    saveDocument(pageId: string, content: DocumentContent): Promise<void>;
    uploadFile(pageId: string, file: File): Promise<string>;
    markdownToBlocks(markdown: string): unknown[];
    onProgress?(progress: { done: number; total: number; title: string }): void;
    signal?: AbortSignal;
};

export type ImportSummary = {
    rootPageId: string | null;
    pages: number;
    /** Pages found in the export (without databases). */
    plannedPages: number;
    files: number;
    databases: SkippedDatabase[];
    problems: string[];
    /** Set when the import stopped early; what was imported stays. */
    error: string | null;
    cancelled: boolean;
};

const decoder = new TextDecoder();

function rootDocument(summary: { pages: number; databases: SkippedDatabase[] }): DocumentContent {
    const date = new Date().toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
    const blocks: DocumentContent = [
        {
            type: "paragraph",
            content: [{ type: "text", text: `Aus Notion importiert am ${date}: ${summary.pages} Seiten.`, styles: {} }],
        },
    ];
    if (summary.databases.length > 0) {
        blocks.push({
            type: "paragraph",
            content: [
                {
                    type: "text",
                    text: "Diese Datenbanken sind noch nicht übernommen (folgt mit einem späteren Import):",
                    styles: {},
                },
            ],
        });
        for (const database of summary.databases) {
            blocks.push({ type: "bulletListItem", content: [{ type: "text", text: database.title, styles: {} }] });
        }
    }
    return blocks;
}

/**
 * Imports the pages of a Notion export (CLAUDE.md §12 P16a): a private page
 * "Notion-Import" with the exported pages below it, in Notion's order, with
 * their text, images and attachments. Pages are created one after another
 * and need the server; a failure stops the import, what was imported stays.
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
        plannedPages: plan.pages.length,
        files: 0,
        databases: plan.databases,
        problems: [],
        error: null,
        cancelled: false,
    };
    if (plan.pages.length === 0 && plan.databases.length === 0) {
        summary.error = "Im Export wurden keine Seiten gefunden. Bitte in Notion „Markdown & CSV“ wählen.";
        return summary;
    }

    try {
        const root = await dependencies.createPage(IMPORT_ROOT_TITLE, null);
        summary.rootPageId = root.id;
        const pageIds = new Map<string, string>();

        for (const [index, planned] of plan.pages.entries()) {
            if (dependencies.signal?.aborted) {
                summary.cancelled = true;
                break;
            }
            dependencies.onProgress?.({ done: index, total: plan.pages.length, title: planned.title });

            const parentId = (planned.parentPath && pageIds.get(planned.parentPath)) || root.id;
            const page = await dependencies.createPage(planned.title, parentId);
            pageIds.set(planned.path, page.id);

            const classify = (href: string): LinkTarget => {
                const path = resolveExportPath(planned.path, href)?.normalize("NFC");
                if (!path) return { kind: "web" };
                const lower = path.toLowerCase();
                if (lower.endsWith(".md")) return { kind: "page" };
                if (lower.endsWith(".csv")) return { kind: "database" };
                return archive.has(path) ? { kind: "file", path } : { kind: "missing", path };
            };
            const upload = async (path: string): Promise<UploadResult> => {
                const data = archive.get(path);
                if (!data) return { error: "nicht im Export enthalten" };
                try {
                    const file = new File([new Uint8Array(data)], path.split("/").pop() ?? "datei");
                    return { reference: await dependencies.uploadFile(page.id, file) };
                } catch (error) {
                    return { error: error instanceof Error ? error.message : "Hochladen fehlgeschlagen" };
                }
            };

            const { body } = splitTitle(markdown.get(planned.path) ?? "");
            const parsed = dependencies.markdownToBlocks(body);
            const result = await rewriteImportedBlocks(parsed, classify, upload);
            summary.files += result.files;
            summary.problems.push(...result.problems.map((problem) => `${planned.title}: ${problem}`));
            if (result.blocks.length > 0 && isDocumentContent(result.blocks)) {
                await dependencies.saveDocument(page.id, result.blocks);
            }
            summary.pages += 1;
        }

        dependencies.onProgress?.({ done: summary.pages, total: plan.pages.length, title: "" });
        await dependencies.saveDocument(root.id, rootDocument(summary));
    } catch (error) {
        console.error("Notion-Import abgebrochen:", error);
        summary.error = error instanceof Error ? error.message : "Der Import ist fehlgeschlagen.";
    }
    return summary;
}
