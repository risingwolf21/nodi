import { describe, expect, it } from "vitest";
import {
    collectDescendantIds,
    collectRestoreIds,
    findAncestors,
    findArchivedAncestors,
    pagesInSection,
} from "./page-hierarchy";
import type { Page } from "./types";

// Projekt > Kapitel > Abschnitt > Notiz, daneben Kapitel 2 unter Projekt
const project: Page = { id: "project", title: "Projekt", parent_id: null, owner_id: "u1", visibility: "private", icon: null, full_width: false, kind: "page", position: null, created_at: "" };
const chapter: Page = { id: "chapter", title: "Kapitel", parent_id: "project", owner_id: "u1", visibility: "private", icon: null, full_width: false, kind: "page", position: null, created_at: "" };
const chapterTwo: Page = { id: "chapter-2", title: "Kapitel 2", parent_id: "project", owner_id: "u1", visibility: "private", icon: null, full_width: false, kind: "page", position: null, created_at: "" };
const section: Page = { id: "section", title: "Abschnitt", parent_id: "chapter", owner_id: "u1", visibility: "private", icon: null, full_width: false, kind: "page", position: null, created_at: "" };
const note: Page = { id: "note", title: "Notiz", parent_id: "section", owner_id: "u1", visibility: "private", icon: null, full_width: false, kind: "page", position: null, created_at: "" };

const allArchived = [project, chapter, chapterTwo, section, note];

describe("collectDescendantIds", () => {
    it("returns the page and all of its descendants", () => {
        expect(collectDescendantIds("chapter", allArchived).sort()).toEqual(
            ["chapter", "note", "section"],
        );
    });

    it("terminates on a parent cycle", () => {
        const first: Page = { id: "a", title: "A", parent_id: "b", owner_id: "u1", visibility: "private", icon: null, full_width: false, kind: "page", position: null, created_at: "" };
        const second: Page = { id: "b", title: "B", parent_id: "a", owner_id: "u1", visibility: "private", icon: null, full_width: false, kind: "page", position: null, created_at: "" };

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
        const first: Page = { id: "a", title: "A", parent_id: "b", owner_id: "u1", visibility: "private", icon: null, full_width: false, kind: "page", position: null, created_at: "" };
        const second: Page = { id: "b", title: "B", parent_id: "a", owner_id: "u1", visibility: "private", icon: null, full_width: false, kind: "page", position: null, created_at: "" };

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

describe("pagesInSection", () => {
    const shared: Page = { id: "shared", title: "Team", parent_id: null, owner_id: "u1", visibility: "workspace", icon: null, full_width: false, kind: "page", position: null, created_at: "" };
    const sharedChild: Page = { ...shared, id: "shared-child", parent_id: "shared" };
    // An older private subpage of a shared page stays below its root
    const privateBelowShared: Page = { ...shared, id: "private-below", parent_id: "shared", visibility: "private" };
    const own: Page = { ...shared, id: "own", visibility: "private" };
    const ownChild: Page = { ...own, id: "own-child", parent_id: "own" };
    const all = [shared, sharedChild, privateBelowShared, own, ownChild];

    it("splits the tree by the section of each root page", () => {
        expect(pagesInSection(all, "workspace").map((page) => page.id)).toEqual(["shared", "shared-child", "private-below"]);
        expect(pagesInSection(all, "private").map((page) => page.id)).toEqual(["own", "own-child"]);
    });

    it("treats a page whose parent is not in the list as a root and survives cycles", () => {
        const orphan: Page = { ...shared, id: "orphan", parent_id: "missing", visibility: "private" };
        const a: Page = { ...shared, id: "a", parent_id: "b" };
        const b: Page = { ...shared, id: "b", parent_id: "a" };
        expect(pagesInSection([orphan, a, b], "private").map((page) => page.id)).toEqual(["orphan"]);
        expect(pagesInSection([orphan, a, b], "workspace").map((page) => page.id)).toEqual(["a", "b"]);
    });
});
