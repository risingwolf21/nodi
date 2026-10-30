import type { Page } from "./types";

// Shown for entries of a database, which may have an empty title.
export const UNTITLED = "Ohne Titel";

/** The title a new page starts with; a template replaces it like an empty one (package 38b). */
export const NEW_PAGE_TITLE = "Unbenannte Seite";

export function displayTitle(page: Pick<Page, "title">): string {
    return page.title || UNTITLED;
}

/** The title of a duplicate (package 47), as duplicate_page names it. */
export function duplicateTitle(title: string): string {
    return `${title.trim() ? title : UNTITLED} (Kopie)`;
}
