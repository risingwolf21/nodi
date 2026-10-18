import { describe, expect, it } from "vitest";
import {
    collectDescendantIds,
    collectRestoreIds,
    findAncestors,
    findArchivedAncestors,
} from "./page-hierarchy";
import type { Page } from "./types";

// Projekt > Kapitel > Abschnitt > Notiz, daneben Kapitel 2 unter Projekt
const project: Page = { id: "project", title: "Projekt", parent_id: null, icon: null };
const chapter: Page = { id: "chapter", title: "Kapitel", parent_id: "project", icon: null };
const chapterTwo: Page = { id: "chapter-2", title: "Kapitel 2", parent_id: "project", icon: null };
const section: Page = { id: "section", title: "Abschnitt", parent_id: "chapter", icon: null };
const note: Page = { id: "note", title: "Notiz", parent_id: "section", icon: null };

const allArchived = [project, chapter, chapterTwo, section, note];

describe("collectDescendantIds", () => {
    it("returns the page and all of its descendants", () => {
        expect(collectDescendantIds("chapter", allArchived).sort()).toEqual(
            ["chapter", "note", "section"],
        );
    });

    it("terminates on a parent cycle", () => {
        const first: Page = { id: "a", title: "A", parent_id: "b", icon: null };
        const second: Page = { id: "b", title: "B", parent_id: "a", icon: null };

        expect(collectDescendantIds("a", [first, second]).sort()).toEqual(["a", "b"]);
    });
});

describe("findArchivedAncestors", () => {
    it("returns archived ancestors, nearest first", () => {
        expect(findArchivedAncestors("section", allArchived)).toEqual([chapter, project]);
    });

    it("stops at the first ancestor that is not archived", () => {
        // project is active, only chapter is archived
        expect(findArchivedAncestors("section", [chapter, section])).toEqual([chapter]);
    });

    it("returns nothing for a top-level page", () => {
        expect(findArchivedAncestors("project", allArchived)).toEqual([]);
    });

    it("terminates on a parent cycle", () => {
        const first: Page = { id: "a", title: "A", parent_id: "b", icon: null };
        const second: Page = { id: "b", title: "B", parent_id: "a", icon: null };

        expect(findArchivedAncestors("a", [first, second])).toEqual([second]);
    });
});

describe("collectRestoreIds", () => {
    it("restores the page, its descendants and its archived ancestors", () => {
        expect(collectRestoreIds("chapter", allArchived).sort()).toEqual(
            ["chapter", "note", "project", "section"],
        );
    });

    it("does not restore siblings of restored ancestors", () => {
        expect(collectRestoreIds("chapter", allArchived)).not.toContain("chapter-2");
    });

    it("restores only the subtree when the parent is active", () => {
        expect(collectRestoreIds("section", [section, note]).sort()).toEqual(
            ["note", "section"],
        );
    });
});

describe("findAncestors", () => {
    it("returns the path to the root, nearest first", () => {
        expect(findAncestors("note", allArchived).map((page) => page.id)).toEqual([
            "section",
            "chapter",
            "project",
        ]);
    });

    it("returns nothing for a root page", () => {
        expect(findAncestors("project", allArchived)).toEqual([]);
    });
});
