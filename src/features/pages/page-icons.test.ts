import { describe, expect, it } from "vitest";
import { searchIcons, typedEmoji } from "./page-icons";

describe("searchIcons", () => {
    it("finds emojis by the start of their German words", () => {
        expect(searchIcons("rak")).toEqual(["🚀"]);
        expect(searchIcons("Geld")).toContain("💰");
        // Every word of the query must fit.
        expect(searchIcons("reise zug")).toEqual(["🚆"]);
        expect(searchIcons("xyz")).toEqual([]);
    });

    it("shows all emojis for an empty query, each once", () => {
        const all = searchIcons(" ");
        expect(all.length).toBeGreaterThan(100);
        expect(new Set(all).size).toBe(all.length);
    });
});

describe("typedEmoji", () => {
    it("takes one emoji typed or pasted, also with modifiers and joins", () => {
        expect(typedEmoji(" 🦄 ")).toBe("🦄");
        expect(typedEmoji("👍🏽")).toBe("👍🏽");
        expect(typedEmoji("🧑‍🚀")).toBe("🧑‍🚀");
        expect(typedEmoji("🇩🇪")).toBe("🇩🇪");
        expect(typedEmoji("rakete")).toBeNull();
        expect(typedEmoji("🦄🦄")).toBeNull();
    });
});
