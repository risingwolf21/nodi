import { describe, expect, it, vi } from "vitest";
import { markdownToImportedBlocks, rewriteImportedBlocks, type LinkTarget, type UploadResult } from "./import-blocks";

const text = (value: string) => ({ type: "text", text: value, styles: {} });
const link = (href: string, label: string) => ({ type: "link", href, content: [text(label)] });

function classify(href: string): LinkTarget {
    if (href.startsWith("http")) return { kind: "web" };
    if (href.endsWith(".md")) return { kind: "page" };
    if (href.endsWith(".csv")) return { kind: "database", databaseId: href.startsWith("Aufgaben") ? "db1" : null };
    if (href.includes("fehlt")) return { kind: "missing", path: `Seite/${href}` };
    return { kind: "file", path: `Seite/${decodeURIComponent(href)}` };
}

const upload = vi.fn(async (path: string): Promise<UploadResult> =>
    path.endsWith("riesig.pdf") ? { error: "Die Datei ist größer als 10 MB." } : { reference: `nodi-file:p/${path}` },
);

describe("rewriteImportedBlocks", () => {
    it("uploads images and attachments of the export and references them", async () => {
        const result = await rewriteImportedBlocks(
            [
                { type: "image", props: { url: "Foto%201.png", caption: "Strand" }, children: [] },
                { type: "paragraph", content: [link("Plan.pdf", "Plan.pdf")], children: [] },
                { type: "paragraph", content: [text(" "), link("Skizze.png", "Skizze"), text(" ")], children: [] },
                { type: "image", props: { url: "https://example.com/web.png" }, children: [] },
            ],
            classify,
            upload,
        );
        expect(result.blocks).toEqual([
            {
                type: "image",
                props: { url: "nodi-file:p/Seite/Foto 1.png", name: "Foto 1.png", caption: "Strand" },
                children: [],
            },
            // Converted paragraphs keep no inline content: BlockNote rejects file blocks with content.
            { type: "file", props: { url: "nodi-file:p/Seite/Plan.pdf", name: "Plan.pdf" }, children: [] },
            { type: "image", props: { url: "nodi-file:p/Seite/Skizze.png", name: "Skizze.png" }, children: [] },
            { type: "image", props: { url: "https://example.com/web.png" }, children: [] },
        ]);
        expect(result.files).toBe(3);
        expect(result.problems).toEqual([]);
    });

    it("turns links to other pages and databases into text, keeps web links", async () => {
        const result = await rewriteImportedBlocks(
            [
                {
                    type: "paragraph",
                    content: [
                        text("Siehe "),
                        link("Tag%201.md", "Tag 1"),
                        text(", "),
                        link("Aufgaben.csv", "Aufgaben"),
                        text(" und "),
                        link("https://notion.so", "Notion"),
                    ],
                    children: [],
                },
            ],
            classify,
            upload,
        );
        expect(result.blocks[0].content).toEqual([
            text("Siehe "),
            text("Tag 1"),
            text(", "),
            text("Aufgaben"),
            text(" und "),
            link("https://notion.so", "Notion"),
        ]);
    });

    it("turns a link to an imported page into a page link", async () => {
        const result = await rewriteImportedBlocks(
            [{ type: "paragraph", content: [text("Siehe "), link("Tag%201.md", "Tag 1")], children: [] }],
            (href) => (href.endsWith(".md") ? { kind: "page", pageId: "page-1" } : classify(href)),
            upload,
        );
        expect(result.blocks[0].content).toEqual([
            text("Siehe "),
            { type: "pageLink", props: { pageId: "page-1", title: "Tag 1" } },
        ]);
    });

    it("turns a link to an imported database on its own into a database block", async () => {
        const result = await rewriteImportedBlocks(
            [
                { type: "paragraph", content: [link("Aufgaben%20abc.csv", "Aufgaben")], children: [] },
                // Not imported: stays text.
                { type: "paragraph", content: [link("Fremd.csv", "Fremd")], children: [] },
            ],
            classify,
            upload,
        );
        const [block] = result.databaseBlocks;
        expect(result.databaseBlocks).toEqual([{ blockId: expect.any(String), databaseId: "db1", sort: [] }]);
        expect(result.blocks).toEqual([
            { id: block.blockId, type: "database", props: { databaseId: "db1" }, children: [] },
            { type: "paragraph", content: [text("Fremd")], children: [] },
        ]);
    });

    it("reports files that are missing or too large instead of dropping them", async () => {
        const result = await rewriteImportedBlocks(
            [
                { type: "image", props: { url: "fehlt.png" }, children: [] },
                { type: "paragraph", content: [link("riesig.pdf", "riesig.pdf")], children: [] },
            ],
            classify,
            upload,
        );
        expect(result.blocks.map((block) => block.content)).toEqual([
            [{ type: "text", text: "Datei fehlt im Export: fehlt.png", styles: { italic: true } }],
            [
                {
                    type: "text",
                    text: "Datei nicht übernommen: riesig.pdf (Die Datei ist größer als 10 MB.)",
                    styles: { italic: true },
                },
            ],
        ]);
        expect(result.problems).toEqual([
            "fehlt.png: nicht im Export enthalten",
            "riesig.pdf: Die Datei ist größer als 10 MB.",
        ]);
    });

    it("rewrites nested blocks and table cells", async () => {
        const result = await rewriteImportedBlocks(
            [
                {
                    type: "bulletListItem",
                    content: [text("Liste")],
                    children: [{ type: "image", props: { url: "Kind.png" }, children: [] }],
                },
                {
                    type: "table",
                    content: { type: "tableContent", rows: [{ cells: [[link("Tag%201.md", "Tag 1")], [text("x")]] }] },
                    children: [],
                },
            ],
            classify,
            upload,
        );
        expect(result.blocks[0].children).toEqual([
            { type: "image", props: { url: "nodi-file:p/Seite/Kind.png", name: "Kind.png" }, children: [] },
        ]);
        expect(result.blocks[1].content).toEqual({
            type: "tableContent",
            rows: [{ cells: [[text("Tag 1")], [text("x")]] }],
        });
    });
});

describe("markdownToImportedBlocks", () => {
    // One paragraph per line; a line that is a link on its own is a link.
    const parse = (markdown: string) =>
        markdown
            .split("\n")
            .filter((line) => line.trim())
            .map((line) => {
                const only = /^\[(.*)\]\((.*)\)$/.exec(line);
                return { type: "paragraph", content: [only ? link(only[2], only[1]) : text(line)], children: [] };
            });

    it("turns Notion's asides into callouts with their emoji and nested blocks", () => {
        const markdown =
            "Vorher\n<aside>\n💡 Tipp: früh anfangen\n\nZweiter Absatz\n</aside>\n<aside>\n[Aufgaben](Aufgaben.csv)\n</aside>\nDanach";
        expect(markdownToImportedBlocks(markdown, parse)).toEqual([
            { type: "paragraph", content: [text("Vorher")], children: [] },
            {
                type: "callout",
                props: { emoji: "💡" },
                content: [text("Tipp: früh anfangen")],
                children: [{ type: "paragraph", content: [text("Zweiter Absatz")], children: [] }],
            },
            // A link on its own stays a block below an empty callout (it may become a database).
            {
                type: "callout",
                props: {},
                content: [],
                children: [{ type: "paragraph", content: [link("Aufgaben.csv", "Aufgaben")], children: [] }],
            },
            { type: "paragraph", content: [text("Danach")], children: [] },
        ]);
    });
});
