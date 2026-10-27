import { filePathFromReference } from "@/features/files/file-reference";
import { personName } from "@/features/mentions/mentions";

// A page's blocks (BlockNote JSON, nodi's schema) as Markdown that nodi's
// import reads back (package 34a). BlockNote converts its own blocks; nodi's
// own blocks and inline content are turned into those first.

type JsonObject = Record<string, unknown>;

export type ExportLinks = {
    /** A page in the export: its link and current title; null when it is not exported. */
    page: (pageId: string) => { href: string; title: string } | null;
    /** A database in the export, as for pages. */
    database: (databaseId: string) => { href: string; title: string } | null;
    /** A file of the Storage, put into the export: its link there. */
    file: (storagePath: string) => string;
};

/** BlockNote's own conversion (`blocksToMarkdownLossy`); given, so this stays testable without an editor. */
export type BlocksToMarkdown = (blocks: JsonObject[]) => string;

const FILE_BLOCKS = new Set(["image", "file", "video", "audio"]);

const isObject = (value: unknown): value is JsonObject => typeof value === "object" && value !== null;
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: string): JsonObject => ({ type: "text", text: value, styles: {} });

function exportInline(items: unknown[], links: ExportLinks): JsonObject[] {
    return items.flatMap((item): JsonObject[] => {
        if (!isObject(item)) return [];
        if (item.type === "pageLink" && isObject(item.props)) {
            const stored = typeof item.props.title === "string" ? item.props.title : "";
            const target = typeof item.props.pageId === "string" ? links.page(item.props.pageId) : null;
            // Not exported: its title stays as text, like a link the import cannot resolve.
            return target
                ? [{ type: "link", href: target.href, content: [text(target.title || stored)] }]
                : [text(stored || "Ohne Titel")];
        }
        if (item.type === "mention" && isObject(item.props)) {
            // A person (package 37) becomes their name as text; Markdown has no mentions.
            return [text(`@${personName(typeof item.props.label === "string" ? item.props.label : "")}`)];
        }
        if (item.type === "text" && isObject(item.styles) && "comment" in item.styles) {
            // A comment mark (package 31b) is not part of the text.
            const styles = Object.fromEntries(Object.entries(item.styles).filter(([key]) => key !== "comment"));
            return [{ ...item, styles }];
        }
        if (item.type === "link") return [{ ...item, content: exportInline(list(item.content), links) }];
        return [item];
    });
}

function exportContent(content: unknown, links: ExportLinks): unknown {
    if (Array.isArray(content)) return exportInline(content, links);
    if (isObject(content) && content.type === "tableContent") {
        return {
            ...content,
            rows: list(content.rows).map((row) =>
                isObject(row)
                    ? {
                          ...row,
                          cells: list(row.cells).map((cell) =>
                              Array.isArray(cell)
                                  ? exportInline(cell, links)
                                  : isObject(cell)
                                    ? { ...cell, content: exportInline(list(cell.content), links) }
                                    : cell,
                          ),
                      }
                    : row,
            ),
        };
    }
    return content;
}

/** nodi's blocks as BlockNote's standard blocks; callouts are kept for the caller. */
function exportBlocks(blocks: unknown[], links: ExportLinks, keepCallouts: boolean): JsonObject[] {
    return blocks.flatMap((value): JsonObject[] => {
        if (!isObject(value)) return [];
        const props = isObject(value.props) ? value.props : {};
        const children = exportBlocks(list(value.children), links, false);

        switch (value.type) {
            case "columns":
            case "column":
                // Columns (package 32e) are a layout: their content one after another.
                return children;
            case "database": {
                // A link on its own line: the import makes it a "Datenbank" block again.
                const target = typeof props.databaseId === "string" ? links.database(props.databaseId) : null;
                if (!target) return [];
                const link = { type: "link", href: target.href, content: [text(target.title)] };
                return [{ type: "paragraph", props: {}, content: [link], children: [] }];
            }
            case "callout": {
                const content = exportInline(list(value.content), links);
                if (keepCallouts) return [{ ...value, content, children }];
                // Inside another block Markdown has no callout: its emoji and text as a paragraph.
                const emoji = typeof props.emoji === "string" && props.emoji ? [text(`${props.emoji} `)] : [];
                return [{ type: "paragraph", props: {}, content: [...emoji, ...content], children }];
            }
        }

        if (typeof value.type === "string" && FILE_BLOCKS.has(value.type)) {
            const path = typeof props.url === "string" ? filePathFromReference(props.url) : null;
            return [{ ...value, props: path ? { ...props, url: links.file(path) } : props, children }];
        }
        return [{ ...value, content: exportContent(value.content, links), children }];
    });
}

/** The Markdown of a page: `# Title`, then its text; callouts as `<aside>` like Notion's. */
export function pageMarkdown(
    title: string,
    document: readonly unknown[],
    links: ExportLinks,
    blocksToMarkdown: BlocksToMarkdown,
): string {
    const parts = [`# ${title.trim() || "Ohne Titel"}`];
    let run: JsonObject[] = [];
    const flush = () => {
        if (run.length > 0) parts.push(blocksToMarkdown(run).trim());
        run = [];
    };

    for (const block of exportBlocks([...document], links, true)) {
        if (block.type !== "callout") {
            run.push(block);
            continue;
        }
        flush();
        const props = isObject(block.props) ? block.props : {};
        const emoji = typeof props.emoji === "string" && props.emoji ? `${props.emoji} ` : "";
        const first = blocksToMarkdown([{ type: "paragraph", props: {}, content: list(block.content), children: [] }]);
        const rest = list(block.children).filter(isObject);
        const inner = [`${emoji}${first.trim()}`, rest.length ? blocksToMarkdown(rest).trim() : ""].filter(Boolean);
        parts.push(`<aside>\n${inner.join("\n\n")}\n</aside>`);
    }
    flush();
    return `${parts.filter(Boolean).join("\n\n")}\n`;
}
