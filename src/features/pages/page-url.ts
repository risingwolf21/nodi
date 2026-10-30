// Each page has its own address (package 46): …/nodi/?id=<page id>. A query
// parameter needs no route on GitHub Pages and keeps the page open on reload.
const PAGE_PARAMETER = "id";
const PAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The page an address names, or "" (anything but a page id is ignored). */
export function pageIdFromSearch(search: string): string {
    const pageId = new URLSearchParams(search).get(PAGE_PARAMETER) ?? "";
    return PAGE_ID.test(pageId) ? pageId.toLowerCase() : "";
}

/** The address of a page within the app, for the address bar. */
export function pagePath(pageId: string): string {
    return `${import.meta.env.BASE_URL}?${PAGE_PARAMETER}=${encodeURIComponent(pageId)}`;
}

/** The full link of a page, to copy and send. */
export function pageLink(pageId: string, origin = location.origin): string {
    return new URL(pagePath(pageId), origin).href;
}
