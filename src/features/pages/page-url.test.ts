import { describe, expect, it } from "vitest";
import { pageIdFromSearch, pageLink, pagePath } from "./page-url";

const PAGE = "b0000000-0000-4000-8000-000000000001";

describe("page addresses", () => {
    it("reads the page id from the address", () => {
        expect(pageIdFromSearch(`?id=${PAGE}`)).toBe(PAGE);
        expect(pageIdFromSearch(`?id=${PAGE.toUpperCase()}`)).toBe(PAGE);
        expect(pageIdFromSearch(`?x=1&id=${PAGE}`)).toBe(PAGE);
    });

    it("ignores anything but a page id", () => {
        expect(pageIdFromSearch("")).toBe("");
        expect(pageIdFromSearch("?id=")).toBe("");
        expect(pageIdFromSearch("?id=abc")).toBe("");
        expect(pageIdFromSearch(`?id=${PAGE}x`)).toBe("");
        expect(pageIdFromSearch(`?p=${PAGE}`)).toBe("");
    });

    it("builds the address below the base path", () => {
        const base = import.meta.env.BASE_URL;
        expect(pagePath(PAGE)).toBe(`${base}?id=${PAGE}`);
        expect(pageLink(PAGE, "https://risingwolf21.github.io")).toBe(
            `https://risingwolf21.github.io${base}?id=${PAGE}`,
        );
        expect(pageIdFromSearch(new URL(pageLink(PAGE, "https://example.org")).search)).toBe(PAGE);
    });
});
