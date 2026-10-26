import { describe, expect, it } from "vitest";
import { templateContent, templateCover } from "./template-content";
import type { DocumentContent } from "./types";

const PAGE = "11111111-1111-4111-8111-111111111111";
const TEMPLATE = "22222222-2222-4222-8222-222222222222";
const FILE = `${TEMPLATE}/33333333-3333-4333-8333-333333333333-Plan.png`;
const COPY = new RegExp(`^${PAGE}/[0-9a-f-]{36}-Plan\\.png$`);

describe("templateContent", () => {
    it("drops block ids, also of nested blocks", () => {
        const content: DocumentContent = [
            {
                id: "a",
                type: "paragraph",
                content: [{ type: "text", text: "Agenda", styles: { bold: true } }],
                children: [{ id: "b", type: "paragraph", content: "Punkt" }],
            },
        ];

        expect(templateContent(content, PAGE)).toEqual({
            content: [
                {
                    type: "paragraph",
                    content: [{ type: "text", text: "Agenda", styles: { bold: true } }],
                    children: [{ type: "paragraph", content: "Punkt" }],
                },
            ],
            files: [],
        });
    });

    it("leaves out comment marks, also in links and tables", () => {
        const content: DocumentContent = [
            {
                type: "paragraph",
                content: [
                    { type: "text", text: "Frage", styles: { comment: "thread-1", italic: true } },
                    {
                        type: "link",
                        href: "https://example.org",
                        content: [{ type: "text", text: "Link", styles: { comment: "thread-2" } }],
                    },
                ],
            },
            {
                type: "table",
                content: {
                    type: "tableContent",
                    rows: [{ cells: [[{ type: "text", text: "Zelle", styles: { comment: "thread-3" } }]] }],
                },
            },
        ];

        expect(templateContent(content, PAGE)?.content).toEqual([
            {
                type: "paragraph",
                content: [
                    { type: "text", text: "Frage", styles: { italic: true } },
                    {
                        type: "link",
                        href: "https://example.org",
                        content: [{ type: "text", text: "Link", styles: {} }],
                    },
                ],
            },
            {
                type: "table",
                content: {
                    type: "tableContent",
                    rows: [{ cells: [[{ type: "text", text: "Zelle", styles: {} }]] }],
                },
            },
        ]);
    });

    it("copies files into the page's folder, each once; other URLs stay", () => {
        const content: DocumentContent = [
            { type: "image", props: { url: `nodi-file:${FILE}`, caption: "Plan" } },
            { type: "paragraph", children: [{ type: "image", props: { url: `nodi-file:${FILE}` } }] },
            { type: "image", props: { url: "https://example.org/bild.png" } },
        ];

        const copy = templateContent(content, PAGE);
        expect(copy?.files).toHaveLength(1);
        const target = copy?.files[0];
        expect(target?.from).toBe(FILE);
        expect(target?.to).toMatch(COPY);
        expect(copy?.content).toEqual([
            { type: "image", props: { url: `nodi-file:${target?.to}`, caption: "Plan" } },
            { type: "paragraph", children: [{ type: "image", props: { url: `nodi-file:${target?.to}` } }] },
            { type: "image", props: { url: "https://example.org/bild.png" } },
        ]);
    });

    it("keeps the template unchanged", () => {
        const content: DocumentContent = [{ id: "a", type: "paragraph", content: "Text" }];
        templateContent(content, PAGE);
        expect(content).toEqual([{ id: "a", type: "paragraph", content: "Text" }]);
    });
});

describe("templateCover", () => {
    it("keeps a gradient and copies an image", () => {
        expect(templateCover("gradient:sunset", PAGE)).toEqual({ cover: "gradient:sunset", files: [] });
        const image = templateCover(`nodi-file:${FILE}`, PAGE);
        expect(image.files).toEqual([{ from: FILE, to: expect.stringMatching(COPY) as string }]);
        expect(image.cover).toBe(`nodi-file:${image.files[0]?.to}`);
    });
});
