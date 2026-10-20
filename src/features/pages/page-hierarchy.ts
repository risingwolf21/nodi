import type { Page } from "./types";

/** Position after the last of `siblings`, for the manual order. */
export function nextPosition(siblings: Page[]): number {
    const positions = siblings.flatMap((page) => (page.position === null ? [] : [page.position]));
    return positions.length === 0 ? siblings.length : Math.max(...positions) + 1;
}

/** An entry of a database; unlike other pages it may have an empty title. */
export function isDatabaseEntry(pageId: string, pages: Page[]): boolean {
    const parentId = pages.find((page) => page.id === pageId)?.parent_id;
    return (
        parentId !== undefined &&
        parentId !== null &&
        pages.some((page) => page.id === parentId && page.kind === "database")
    );
}

/**
 * Entries of databases are shown in the database, not in the page tree;
 * the database itself stays (its entries are not its tree children). The
 * subpages of an entry are shown in the entry (package 23), so they and
 * everything below them are left out as well.
 */
export function withoutDatabaseEntries(pages: Page[]): Page[] {
    const byId = new Map(pages.map((page) => [page.id, page]));
    const isEntry = (page: Page) => page.parent_id !== null && byId.get(page.parent_id)?.kind === "database";
    const inEntry = (page: Page) => {
        const seen = new Set<string>();
        for (let current: Page | undefined = page; current && !seen.has(current.id);) {
            if (isEntry(current)) return true;
            seen.add(current.id);
            current = current.parent_id ? byId.get(current.parent_id) : undefined;
        }
        return false;
    };
    return pages.filter((page) => !inEntry(page));
}

export function collectDescendantIds(pageId: string, pages: Page[]): string[] {
    const ids = new Set<string>();

    function collect(id: string) {
        if (ids.has(id)) return;

        ids.add(id);

        pages.filter((page) => page.parent_id === id).forEach((child) => collect(child.id));
    }

    collect(pageId);

    return [...ids];
}

/**
 * Archived ancestors of a page, nearest first. Stops at the first ancestor
 * that is not in `archivedPages`, i.e. one that is still active.
 */
export function findArchivedAncestors(pageId: string, archivedPages: Page[]): Page[] {
    return findAncestors(pageId, archivedPages);
}

/** Ancestors of a page within `pages`, nearest first; safe against cycles. */
export function findAncestors(pageId: string, pages: Page[]): Page[] {
    const pagesById = new Map(pages.map((page) => [page.id, page]));
    const ancestors: Page[] = [];
    const visited = new Set([pageId]);

    let parentId = pagesById.get(pageId)?.parent_id ?? null;

    while (parentId && !visited.has(parentId)) {
        const parent = pagesById.get(parentId);
        if (!parent) break;

        ancestors.push(parent);
        visited.add(parentId);
        parentId = parent.parent_id;
    }

    return ancestors;
}

/**
 * Pages to restore together with `pageId`: the page, its archived
 * descendants and its archived ancestors. Restoring the ancestors keeps the
 * page visible in the tree and attached to its parent; a restored page under
 * an archived parent would be hidden and deleted with that parent.
 */
export function collectRestoreIds(pageId: string, archivedPages: Page[]): string[] {
    const ids = new Set(collectDescendantIds(pageId, archivedPages));

    for (const ancestor of findArchivedAncestors(pageId, archivedPages)) {
        ids.add(ancestor.id);
    }

    return [...ids];
}

/**
 * The pages of one section of the sidebar: every root page of that section
 * (a page whose parent is not in the list) with all its subpages. A
 * subpage stays below its root, whatever its own visibility.
 */
export function pagesInSection(pages: Page[], section: Page["visibility"]): Page[] {
    const byId = new Map(pages.map((page) => [page.id, page]));

    function rootOf(page: Page): Page {
        const seen = new Set<string>();
        let current = page;
        while (current.parent_id && byId.has(current.parent_id) && !seen.has(current.id)) {
            seen.add(current.id);
            current = byId.get(current.parent_id) ?? current;
        }
        return current;
    }

    return pages.filter((page) => rootOf(page).visibility === section);
}

/** Where a page moves to: below another page, or to the top of a section (package 18). */
export type MoveTarget = { parentId: string } | { section: Page["visibility"] };

/**
 * Why a page cannot move there (German, for the user), or null. The same
 * rules as the server's move_page, so the app offers only what works;
 * rights on the target are checked by the server.
 */
export function moveProblem(page: Page, target: MoveTarget, pages: Page[], userId: string | undefined): string | null {
    const parent = "parentId" in target ? pages.find((item) => item.id === target.parentId) : undefined;
    if ("parentId" in target) {
        if (!parent) return "Dieses Ziel gibt es nicht mehr.";
        if (collectDescendantIds(page.id, pages).includes(parent.id)) {
            return "Eine Seite kann nicht in sich selbst oder ihre Unterseiten verschoben werden.";
        }
        if (parent.kind === "database" && page.kind === "database") {
            return "Eine Datenbank kann kein Eintrag einer anderen Datenbank werden.";
        }
    }

    const currentParentId = page.parent_id;
    const samePlace =
        "parentId" in target
            ? currentParentId === target.parentId
            : currentParentId === null && page.visibility === target.section;
    if (samePlace) return "Die Seite liegt schon dort.";

    const section = parent ? parent.visibility : "section" in target ? target.section : page.visibility;
    if (section !== page.visibility && page.owner_id !== userId) {
        return "Nur wem die Seite gehört, kann sie in einen anderen Bereich verschieben.";
    }
    return null;
}
