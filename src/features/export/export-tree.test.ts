import { describe, expect, it } from "vitest";
import type { Page } from "@/features/pages/types";
import { exportBaseName, planExport, relativeHref, safeName } from "./export-tree";

const page = (id: string, title: string, extra: Partial<Page> = {}): Page => ({
    id,
    title,
    parent_id: null,
    owner_id: "u",
    visibility: "private",
    icon: null,
    full_width: false,
    kind: "page",
    position: null,
    created_at: "",
    ...extra,
});

const ID_A = "aaaaaaaa-0000-4000-8000-000000000001";
const ID_B = "bbbbbbbb-0000-4000-8000-000000000002";
const ID_C = "cccccccc-0000-4000-8000-000000000003";
const ID_D = "dddddddd-0000-4000-8000-000000000004";

describe("safeName", () => {
    it("removes separators and reserved characters", () => {
        expect(safeName('Ziele 2026/27: "Plan"')).toBe("Ziele 2026-27- -Plan-");
        expect(safeName("  ")).toBe("Ohne Titel");
        expect(safeName("..versteckt")).toBe("versteckt");
        expect(safeName("x".repeat(200))).toHaveLength(80);
    });

    it("names a page like Notion: title and 32 hex characters", () => {
        expect(exportBaseName(page(ID_A, "Reise"))).toBe("Reise aaaaaaaa000040008000000000000001");
    });
});

describe("planExport", () => {
    const pages = [
        page(ID_A, "Reise"),
        page(ID_B, "Tag 2", { parent_id: ID_A }),
        page(ID_C, "Aufgaben", { parent_id: ID_A, kind: "database" }),
        page(ID_D, "Eintrag", { parent_id: ID_C }),
        page("eeeeeeee-0000-4000-8000-000000000005", "Vorlage", { parent_id: ID_A, is_template: true }),
    ];

    it("puts subpages and entries into the folder of their page, parents first and by title", () => {
        expect(planExport(pages, [ID_A]).map((item) => item.path)).toEqual([
            "Reise aaaaaaaa000040008000000000000001.md",
            "Reise aaaaaaaa000040008000000000000001/Aufgaben cccccccc000040008000000000000003.csv",
            "Reise aaaaaaaa000040008000000000000001/Aufgaben cccccccc000040008000000000000003/Eintrag dddddddd000040008000000000000004.md",
            "Reise aaaaaaaa000040008000000000000001/Tag 2 bbbbbbbb000040008000000000000002.md",
        ]);
    });

    it("exports a subpage on its own at the top", () => {
        expect(planExport(pages, [ID_B]).map((item) => item.path)).toEqual([
            "Tag 2 bbbbbbbb000040008000000000000002.md",
        ]);
    });
});

describe("relativeHref", () => {
    it("links within the export, encoded", () => {
        expect(relativeHref("Reise 1.md", "Reise 1/Tag (2).md")).toBe("Reise%201/Tag%20%282%29.md");
        expect(relativeHref("Reise 1/Tag 2.md", "Reise 1.md")).toBe("../Reise%201.md");
        expect(relativeHref("A/B/c.md", "A/d/e.png")).toBe("../d/e.png");
    });
});
