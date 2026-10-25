import { describe, expect, it } from "vitest";
import { pageMarkdown, type ExportLinks } from "./export-markdown";

// A stand-in for BlockNote's conversion: blocks as JSON, so the tests see what it gets.
const asJson = (blocks: unknown[]) => JSON.stringify(blocks);

const links: ExportLinks = {
    page: (id) => (id === "known" ? { href: "Tag%202.md", title: "Tag 2" } : null),
    database: (id) => (id === "db" ? { href: "Aufgaben.csv", title: "Aufgaben" } : null),
    file: () => "Reise/bild.png",
};

const paragraph = (content: unknown[], children: unknown[] = []) => ({
    type: "paragraph",
    props: {},
    content,
    children,
});
const text = (value: string, styles = {}) => ({ type: "text", text: value, styles });

describe("pageMarkdown", () => {
    it("starts with the title as a heading", () => {
        expect(pageMarkdown("", [], links, asJson)).toBe("# Ohne Titel\n");
    });

    it("turns page links into links to the exported page, others into their title", () => {
        const markdown = pageMarkdown(
            "Reise",
            [
                paragraph([
                    { type: "pageLink", props: { pageId: "known", title: "Alt" } },
                    { type: "pageLink", props: { pageId: "gone", title: "Gelöscht" } },
                ]),
            ],
            links,
            asJson,
        );
        expect(markdown).toContain('{"type":"link","href":"Tag%202.md","content":[{"type":"text","text":"Tag 2"');
        expect(markdown).toContain('"text":"Gelöscht"');
    });

    it("makes a database block a link on its own and drops comment marks", () => {
        const markdown = pageMarkdown(
            "Reise",
            [
                { type: "database", props: { databaseId: "db" }, children: [] },
                paragraph([text("markiert", { bold: true, comment: "thread" })]),
            ],
            links,
            asJson,
        );
        expect(markdown).toContain('"href":"Aufgaben.csv"');
        expect(markdown).toContain('"styles":{"bold":true}');
        expect(markdown).not.toContain("comment");
    });

    it("lays out columns one after another and points files into the export", () => {
        const markdown = pageMarkdown(
            "Reise",
            [
                {
                    type: "columns",
                    props: {},
                    children: [
                        { type: "column", props: {}, children: [paragraph([text("links")])] },
                        {
                            type: "column",
                            props: {},
                            children: [
                                {
                                    type: "image",
                                    props: {
                                        url: "nodi-file:aaaaaaaa-0000-4000-8000-000000000001/f1111111-0000-4000-8000-000000000001-bild.png",
                                    },
                                    children: [],
                                },
                            ],
                        },
                    ],
                },
                { type: "image", props: { url: "https://example.com/web.png" }, children: [] },
            ],
            links,
            asJson,
        );
        expect(markdown).toContain('"text":"links"');
        expect(markdown).toContain('"url":"Reise/bild.png"');
        expect(markdown).toContain('"url":"https://example.com/web.png"');
        expect(markdown).not.toContain("columns");
    });

    it("writes a callout as <aside> with its emoji, like Notion", () => {
        const toText = (blocks: unknown[]) =>
            (blocks as { content: { text: string }[] }[])
                .map((block) => block.content.map((item) => item.text).join(""))
                .join("\n");
        const markdown = pageMarkdown(
            "Reise",
            [
                {
                    type: "callout",
                    props: { emoji: "💡" },
                    content: [text("Tipp")],
                    children: [paragraph([text("Mehr")])],
                },
            ],
            links,
            toText,
        );
        expect(markdown).toBe("# Reise\n\n<aside>\n💡 Tipp\n\nMehr\n</aside>\n");
    });
});
