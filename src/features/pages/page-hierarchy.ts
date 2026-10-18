import type { Page } from "./types";

export function collectDescendantIds(pageId: string, pages: Page[]): string[] {
    const ids = new Set<string>();

    function collect(id: string) {
        if (ids.has(id)) return;

        ids.add(id);

        pages
            .filter((page) => page.parent_id === id)
            .forEach((child) => collect(child.id));
    }

    collect(pageId);

    return [...ids];
}

/**
 * Archived ancestors of a page, nearest first. Stops at the first ancestor
 * that is not in `archivedPages`, i.e. one that is still active.
 */
export function findArchivedAncestors(
    pageId: string,
    archivedPages: Page[],
): Page[] {
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
export function collectRestoreIds(
    pageId: string,
    archivedPages: Page[],
): string[] {
    const ids = new Set(collectDescendantIds(pageId, archivedPages));

    for (const ancestor of findArchivedAncestors(pageId, archivedPages)) {
        ids.add(ancestor.id);
    }

    return [...ids];
}
