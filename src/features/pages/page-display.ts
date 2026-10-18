import type { Page } from "./types";

// Shown for entries of a database, which may have an empty title.
export const UNTITLED = "Ohne Titel";

export function displayTitle(page: Pick<Page, "title">): string {
    return page.title || UNTITLED;
}
