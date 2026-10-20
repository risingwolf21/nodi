import { describe, expect, it } from "vitest";
import type { Page } from "@/features/pages/types";
import { documentText, searchLocally, snippetAround } from "./search-text";

const page = (id: string, title: string): Page => ({
    id,
    title,
    parent_id: null,
    owner_id: "u1",
    visibility: "private",
    icon: null,
    full_width: false,
    kind: "page",
    position: null,
    created_at: "",
});

describe("search on the device", () => {
    it("collects the text of a document, also from links, tables and nested blocks", () => {
        const document = [
            { type: "paragraph", content: [{ type: "text", text: "Hotel", styles: {} }], children: [] },
            {
                type: "callout",
                content: [{ type: "link", href: "https://x.de", content: [{ type: "text", text: "Rom", styles: {} }] }],
                children: [{ type: "paragraph", content: [{ type: "text", text: "buchen", styles: {} }] }],
            },
            {
                type: "table",
                content: { type: "tableContent", rows: [{ cells: [[{ type: "text", text: "Zelle" }]] }] },
            },
        ];
        expect(documentText(document)).toBe("Hotel Rom buchen Zelle");
    });

    it("finds titles first, then texts, with a snippet; at least two characters", () => {
        const pages = [page("a", "Notizen"), page("b", "Reise nach Rom"), page("c", "Einkauf")];
        const texts = new Map([["a", "Im Mai: Hotel in Rom buchen"]]);
        expect(searchLocally("rom", pages, texts).map((result) => [result.page.id, result.snippet])).toEqual([
            ["b", null],
            ["a", "Im Mai: Hotel in Rom buchen"],
        ]);
        expect(searchLocally("r", pages, texts)).toEqual([]);
        expect(snippetAround("x".repeat(100) + "Treffer", "treffer")).toBe(`${"x".repeat(40)}Treffer`);
    });
});
