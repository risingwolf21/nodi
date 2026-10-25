import { describe, expect, it } from "vitest";
import {
    collectDescendantIds,
    collectRestoreIds,
    findAncestors,
    findArchivedAncestors,
    moveProblem,
    pagesInSection,
    placeBefore,
    withoutDatabaseEntries,
} from "./page-hierarchy";
import type { Page } from "./types";

// Projekt > Kapitel > Abschnitt > Notiz, daneben Kapitel 2 unter Projekt
const project: Page = {
    id: "project",
    title: "Projekt",
    parent_id: null,
    owner_id: "u1",
    visibility: "private",
    icon: null,
    full_width: false,
    kind: "page",
    position: null,
    created_at: "",
};
const chapter: Page = {
    id: "chapter",
    title: "Kapitel",
    parent_id: "project",
    owner_id: "u1",
    visibility: "private",
    icon: null,
    full_width: false,
    kind: "page",
    position: null,
    created_at: "",
};
const chapterTwo: Page = {
    id: "chapter-2",
    title: "Kapitel 2",
    parent_id: "project",
    owner_id: "u1",
    visibility: "private",
    icon: null,
    full_width: false,
    kind: "page",
    position: null,
    created_at: "",
};
const section: Page = {
    id: "section",
    title: "Abschnitt",
    parent_id: "chapter",
    owner_id: "u1",
    visibility: "private",
    icon: null,
    full_width: false,
    kind: "page",
    position: null,
    created_at: "",
};
const note: Page = {
    id: "note",
    title: "Notiz",
    parent_id: "section",
    owner_id: "u1",
    visibility: "private",
    icon: null,
    full_width: false,
    kind: "page",
    position: null,
    created_at: "",
};

const allArchived = [project, chapter, chapterTwo, section, note];

describe("collectDescendantIds", () => {
    it("returns the page and all of its descendants", () => {
        expect(collectDescendantIds("chapter", allArchived).sort()).toEqual(["chapter", "note", "section"]);
    });

    it("terminates on a parent cycle", () => {
        const first: Page = {
            id: "a",
            title: "A",
            parent_id: "b",
            owner_id: "u1",
            visibility: "private",
            icon: null,
            full_width: false,
            kind: "page",
            position: null,
            created_at: "",
        };
        const second: Page = {
            id: "b",
            title: "B",
            parent_id: "a",
            owner_id: "u1",
            visibility: "private",
            icon: null,
            full_width: false,
            kind: "page",
            position: null,
            created_at: "",
        };

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
        const first: Page = {
            id: "a",
            title: "A",
            parent_id: "b",
            owner_id: "u1",
            visibility: "private",
            icon: null,
            full_width: false,
            kind: "page",
            position: null,
            created_at: "",
        };
        const second: Page = {
            id: "b",
            title: "B",
            parent_id: "a",
            owner_id: "u1",
            visibility: "private",
            icon: null,
            full_width: false,
            kind: "page",
            position: null,
            created_at: "",
        };

        expect(findArchivedAncestors("a", [first, second])).toEqual([second]);
    });
});

describe("collectRestoreIds", () => {
    it("restores the page, its descendants and its archived ancestors", () => {
        expect(collectRestoreIds("chapter", allArchived).sort()).toEqual(["chapter", "note", "project", "section"]);
    });

    it("does not restore siblings of restored ancestors", () => {
        expect(collectRestoreIds("chapter", allArchived)).not.toContain("chapter-2");
    });

    it("restores only the subtree when the parent is active", () => {
        expect(collectRestoreIds("section", [section, note]).sort()).toEqual(["note", "section"]);
    });
});

describe("findAncestors", () => {
    it("returns the path to the root, nearest first", () => {
        expect(findAncestors("note", allArchived).map((page) => page.id)).toEqual(["section", "chapter", "project"]);
    });

    it("returns nothing for a root page", () => {
        expect(findAncestors("project", allArchived)).toEqual([]);
    });
});

describe("pagesInSection", () => {
    const shared: Page = {
        id: "shared",
        title: "Team",
        parent_id: null,
        owner_id: "u1",
        visibility: "workspace",
        icon: null,
        full_width: false,
        kind: "page",
        position: null,
        created_at: "",
    };
    const sharedChild: Page = { ...shared, id: "shared-child", parent_id: "shared" };
    // An older private subpage of a shared page stays below its root
    const privateBelowShared: Page = { ...shared, id: "private-below", parent_id: "shared", visibility: "private" };
    const own: Page = { ...shared, id: "own", visibility: "private" };
    const ownChild: Page = { ...own, id: "own-child", parent_id: "own" };
    const all = [shared, sharedChild, privateBelowShared, own, ownChild];

    it("splits the tree by the section of each root page", () => {
        expect(pagesInSection(all, "workspace").map((page) => page.id)).toEqual([
            "shared",
            "shared-child",
            "private-below",
        ]);
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

describe("withoutDatabaseEntries", () => {
    it("leaves out entries and everything below them, but not the database", () => {
        const page = (id: string, extra: Partial<Page> = {}): Page => ({ ...project, id, title: id, ...extra });
        const pages = [
            page("tasks", { kind: "database" }),
            page("entry", { parent_id: "tasks" }),
            page("sub", { parent_id: "entry" }),
            page("costs", { parent_id: "sub", kind: "database" }),
            page("notes"),
            page("ideas", { parent_id: "notes" }),
        ];
        expect(withoutDatabaseEntries(pages).map((item) => item.id)).toEqual(["tasks", "notes", "ideas"]);
    });
});

describe("moveProblem", () => {
    const page = (id: string, extra: Partial<Page> = {}): Page => ({ ...project, id, title: id, ...extra });
    const notes = page("notes");
    const ideas = page("ideas", { parent_id: "notes" });
    const shared = page("shared", { visibility: "workspace" });
    const othersShared = page("others", { visibility: "workspace", owner_id: "u2" });
    const tasks = page("tasks", { kind: "database" });
    const contacts = page("contacts", { kind: "database" });
    const pages = [notes, ideas, shared, othersShared, tasks, contacts];

    it("allows moving below another page, into a database and to the top", () => {
        expect(moveProblem(ideas, { parentId: "shared" }, pages, "u1")).toBeNull();
        expect(moveProblem(ideas, { parentId: "tasks" }, pages, "u1")).toBeNull();
        expect(moveProblem(ideas, { section: "private" }, pages, "u1")).toBeNull();
        expect(moveProblem(tasks, { parentId: "notes" }, pages, "u1")).toBeNull();
        // Entries have subpages (package 23).
        expect(moveProblem(notes, { parentId: "tasks" }, pages, "u1")).toBeNull();
    });

    it("rejects what the server rejects", () => {
        expect(moveProblem(notes, { parentId: "ideas" }, pages, "u1")).toContain("in sich selbst");
        expect(moveProblem(notes, { parentId: "notes" }, pages, "u1")).toContain("in sich selbst");
        expect(moveProblem(contacts, { parentId: "tasks" }, pages, "u1")).toContain("Datenbank");
        expect(moveProblem(ideas, { parentId: "notes" }, pages, "u1")).toBe("Die Seite liegt schon dort.");
        expect(moveProblem(notes, { section: "private" }, pages, "u1")).toBe("Die Seite liegt schon dort.");
        expect(moveProblem(ideas, { parentId: "gone" }, pages, "u1")).toContain("gibt es nicht mehr");
    });

    it("lets only the owner change the section", () => {
        expect(moveProblem(othersShared, { section: "private" }, pages, "u1")).toContain("Nur wem die Seite gehört");
        expect(moveProblem(othersShared, { parentId: "notes" }, pages, "u1")).toContain("Nur wem die Seite gehört");
        expect(moveProblem(othersShared, { parentId: "shared" }, pages, "u1")).toBeNull();
    });
});

describe("placeBefore", () => {
    const sibling = (id: string, position: number | null, created_at = id): Page => ({
        ...project,
        id,
        title: id,
        position,
        created_at,
    });

    it("needs one update between two neighbours with positions", () => {
        const pages = [sibling("a", 1), sibling("b", 2), sibling("c", 3)];
        expect(placeBefore(pages, "c", "b")).toEqual([{ id: "c", position: 1.5 }]);
        expect(placeBefore(pages, "a", null)).toEqual([{ id: "a", position: 4 }]);
        expect(placeBefore(pages, "c", "a")).toEqual([{ id: "c", position: 0 }]);
    });

    it("numbers all siblings anew when positions are missing or equal", () => {
        // Pages of the tree have no position before package 32a: their order is by creation.
        const pages = [sibling("a", null, "1"), sibling("b", null, "2"), sibling("c", null, "3")];
        expect(placeBefore(pages, "c", "a")).toEqual([
            { id: "c", position: 0 },
            { id: "a", position: 1 },
            { id: "b", position: 2 },
        ]);
        expect(placeBefore([sibling("a", 1), sibling("b", 1), sibling("c", 2)], "c", "b")).toEqual([
            { id: "a", position: 0 },
            { id: "c", position: 1 },
            { id: "b", position: 2 },
        ]);
    });

    it("changes nothing for a page placed where it is or an unknown target", () => {
        const pages = [sibling("a", 1), sibling("b", 2)];
        expect(placeBefore(pages, "a", "a")).toEqual([]);
        expect(placeBefore(pages, "a", "gone")).toEqual([]);
    });
});
