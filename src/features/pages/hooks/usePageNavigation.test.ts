import { describe, expect, it } from "vitest";
import { pageIdFromHistory } from "./usePageNavigation";

describe("pageIdFromHistory", () => {
    it("reads the open page from a history entry of the app", () => {
        expect(pageIdFromHistory({ nodiPageId: "p1" })).toBe("p1");
    });

    it("ignores other history entries", () => {
        expect(pageIdFromHistory(null)).toBe("");
        expect(pageIdFromHistory("p1")).toBe("");
        expect(pageIdFromHistory({ other: "p1" })).toBe("");
        expect(pageIdFromHistory({ nodiPageId: 42 })).toBe("");
    });
});
