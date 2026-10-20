// Search (package 27): the parts that need no server. Offline the app
// searches the titles it knows and the documents stored on this device.
import type { Page } from "@/features/pages/types";

export const MIN_QUERY_LENGTH = 2;
const SNIPPET_BEFORE = 40;
const SNIPPET_LENGTH = 160;

export type SearchResult = {
    page: Page;
    /** A piece of the text around the first hit; null when only the title matches. */
    snippet: string | null;
};

/** The text of a document, like the server's search_text: every "text" in its blocks. */
export function documentText(content: unknown): string {
    const parts: string[] = [];
    const visit = (value: unknown) => {
        if (Array.isArray(value)) {
            value.forEach(visit);
        } else if (typeof value === "object" && value !== null) {
            for (const [key, item] of Object.entries(value)) {
                if (key === "text" && typeof item === "string") parts.push(item);
                else visit(item);
            }
        }
    };
    visit(content);
    return parts.join(" ");
}

export function snippetAround(text: string, needle: string): string | null {
    const index = text.toLocaleLowerCase("de").indexOf(needle.toLocaleLowerCase("de"));
    if (index === -1) return null;
    const start = Math.max(index - SNIPPET_BEFORE, 0);
    return text.slice(start, start + SNIPPET_LENGTH);
}

/** Title hits first, then text hits, each by title; like search_pages on the server. */
export function searchLocally(query: string, pages: Page[], texts: ReadonlyMap<string, string>): SearchResult[] {
    const needle = query.trim();
    if (needle.length < MIN_QUERY_LENGTH) return [];
    const lower = needle.toLocaleLowerCase("de");
    const results = pages.flatMap((page): (SearchResult & { inTitle: boolean })[] => {
        const inTitle = page.title.toLocaleLowerCase("de").includes(lower);
        const snippet = snippetAround(texts.get(page.id) ?? "", needle);
        return inTitle || snippet ? [{ page, snippet, inTitle }] : [];
    });
    return results
        .sort((a, b) => Number(b.inTitle) - Number(a.inTitle) || a.page.title.localeCompare(b.page.title, "de"))
        .map(({ page, snippet }) => ({ page, snippet }));
}
