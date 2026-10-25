import { describe, expect, it } from "vitest";
import { legalPageFromSearch } from "./legal-page";

describe("legalPageFromSearch", () => {
    it("knows the Impressum and the privacy policy", () => {
        expect(legalPageFromSearch("?seite=impressum")).toBe("impressum");
        expect(legalPageFromSearch("?seite=datenschutz&x=1")).toBe("datenschutz");
    });

    it("ignores other values", () => {
        expect(legalPageFromSearch("")).toBeNull();
        expect(legalPageFromSearch("?seite=agb")).toBeNull();
        expect(legalPageFromSearch("?p=token")).toBeNull();
    });
});
