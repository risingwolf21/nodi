import { isImagePath } from "@/features/files/file-reference";
import type { NotionSort } from "./notion-export";

// Blocks as BlockNote's Markdown parser returns them: plain JSON.
type JsonObject = Record<string, unknown>;

/** Where a link or file URL of a Markdown page points to. */
export type LinkTarget =
    | { kind: "web" }
    | { kind: "page" }
    /** `databaseId` of the imported database; null when it is not imported. `sort`: of an embedded view. */
    | { kind: "database"; databaseId: string | null; sort?: NotionSort[] }
    | { kind: "file"; path: string }
    | { kind: "missing"; path: string };

export type UploadResult = { reference: string } | { error: string };

/** A "Datenbank" block made from a link (package 19d); it gets the database's views. */
export type DatabaseBlockLink = { blockId: string; databaseId: string; sort: NotionSort[] };

export type RewriteResult = {
    blocks: JsonObject[];
    files: number;
    problems: string[];
    databaseBlocks: DatabaseBlockLink[];
};

const FILE_BLOCKS = new Set(["image", "file", "video", "audio"]);

const isObject = (value: unknown): value is JsonObject => typeof value === "object" && value !== null;

const fileName = (path: string) => path.split("/").pop() ?? path;

function note(text: string): JsonObject {
    return { type: "paragraph", content: [{ type: "text", text, styles: { italic: true } }] };
}

/**
 * Turns the parsed Markdown of an exported page into Nodi blocks: images
 * and attachments of the export are uploaded and referenced, a link to an
 * imported database on its own becomes a "Datenbank" block (as Notion shows
 * a database in a page), links to other exported pages become plain text
 * (their pages exist in the tree), links to the web stay. Problems are
 * reported, nothing is dropped silently.
 */
export async function rewriteImportedBlocks(
    blocks: readonly unknown[],
    classify: (href: string) => LinkTarget,
    upload: (path: string) => Promise<UploadResult>,
): Promise<RewriteResult> {
    let files = 0;
    const problems: string[] = [];
    const databaseBlocks: DatabaseBlockLink[] = [];

    const uploadAs = async (path: string, type: string, original: JsonObject): Promise<JsonObject> => {
        const result = await upload(path);
        if ("error" in result) {
            problems.push(`${fileName(path)}: ${result.error}`);
            return note(`Datei nicht übernommen: ${fileName(path)} (${result.error})`);
        }
        files += 1;
        // A file block has no inline content: a converted paragraph must lose its text and paragraph props.
        const props = original.type === type && isObject(original.props) ? original.props : {};
        return {
            type,
            props: { ...props, url: result.reference, name: fileName(path) },
            children: original.children ?? [],
        };
    };

    const rewriteInline = (items: unknown[]): unknown[] =>
        items.flatMap((item) => {
            if (!isObject(item) || item.type !== "link" || typeof item.href !== "string") return [item];
            const target = classify(item.href);
            if (target.kind === "web") return [item];
            if (target.kind === "file") {
                problems.push(`${fileName(target.path)}: Anhang im Fließtext, als Text übernommen`);
            }
            return Array.isArray(item.content) ? item.content : [];
        });

    const rewriteContent = (content: unknown): unknown => {
        if (Array.isArray(content)) return rewriteInline(content);
        if (isObject(content) && content.type === "tableContent" && Array.isArray(content.rows)) {
            return {
                ...content,
                rows: content.rows.map((row) =>
                    isObject(row) && Array.isArray(row.cells)
                        ? {
                              ...row,
                              cells: row.cells.map((cell) =>
                                  Array.isArray(cell)
                                      ? rewriteInline(cell)
                                      : isObject(cell) && Array.isArray(cell.content)
                                        ? { ...cell, content: rewriteInline(cell.content) }
                                        : cell,
                              ),
                          }
                        : row,
                ),
            };
        }
        return content;
    };

    // A paragraph that is only a link: an attachment or a database of the export.
    const onlyLink = (block: JsonObject): LinkTarget | null => {
        if (block.type !== "paragraph" || !Array.isArray(block.content)) return null;
        const meaningful = block.content.filter(
            (item) => !(isObject(item) && item.type === "text" && typeof item.text === "string" && !item.text.trim()),
        );
        const [only] = meaningful;
        if (meaningful.length !== 1 || !isObject(only) || only.type !== "link" || typeof only.href !== "string") {
            return null;
        }
        return classify(only.href);
    };

    const rewriteBlock = async (value: unknown): Promise<JsonObject[]> => {
        if (!isObject(value)) return [];
        const children = Array.isArray(value.children) ? await rewriteAll(value.children) : [];
        const block: JsonObject = { ...value, children };

        if (typeof block.type === "string" && FILE_BLOCKS.has(block.type)) {
            const url = isObject(block.props) && typeof block.props.url === "string" ? block.props.url : "";
            const target = url ? classify(url) : ({ kind: "web" } as const);
            if (target.kind === "file") return [await uploadAs(target.path, block.type, block)];
            if (target.kind !== "web") {
                const missing = "path" in target ? fileName(target.path) : url;
                problems.push(`${missing}: nicht im Export enthalten`);
                return [note(`Datei fehlt im Export: ${missing}`)];
            }
            return [block];
        }

        const link = onlyLink(block);
        if (link?.kind === "file") return [await uploadAs(link.path, isImagePath(link.path) ? "image" : "file", block)];
        if (link?.kind === "database" && link.databaseId) {
            // A fixed id: the block's views are stored under it.
            const blockId = crypto.randomUUID();
            databaseBlocks.push({ blockId, databaseId: link.databaseId, sort: link.sort ?? [] });
            return [
                { id: blockId, type: "database", props: { databaseId: link.databaseId }, children: block.children },
            ];
        }

        return [{ ...block, content: rewriteContent(block.content) }];
    };

    const rewriteAll = async (values: readonly unknown[]): Promise<JsonObject[]> => {
        const result: JsonObject[] = [];
        // One after another: uploads keep the order and do not overload the connection.
        for (const value of values) result.push(...(await rewriteBlock(value)));
        return result;
    };

    return { blocks: await rewriteAll(blocks), files, problems, databaseBlocks };
}
