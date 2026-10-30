import { useEffect, useState } from "react";
import { pageIdFromSearch, pagePath } from "../page-url";

// Open pages are history entries with their own address (package 46), so the
// browser and Android back button return to the previous page or the page list.
const HISTORY_PAGE_KEY = "nodiPageId";

export function pageIdFromHistory(state: unknown): string {
    if (typeof state !== "object" || state === null || !(HISTORY_PAGE_KEY in state)) return "";
    const pageId = state[HISTORY_PAGE_KEY];
    return typeof pageId === "string" ? pageId : "";
}

/** The open page, kept in the browser history and the address bar. */
export function usePageNavigation() {
    // A link to a page opens it; so does a reload.
    const [pageId, setPageId] = useState(() => pageIdFromSearch(location.search));
    // A page created just now: its title gets the focus.
    const [newPageId, setNewPageId] = useState("");

    useEffect(() => {
        const linked = pageIdFromSearch(location.search);
        if (linked && pageIdFromHistory(history.state) !== linked) {
            // Opened from a link: "back" leads to the page list, not out of the app.
            history.replaceState(null, "", import.meta.env.BASE_URL);
            history.pushState({ [HISTORY_PAGE_KEY]: linked }, "", pagePath(linked));
        } else if (!linked && pageIdFromHistory(history.state)) {
            // An entry without an address (older versions) would reopen a stale page.
            history.replaceState(null, "");
        }

        const followHistory = (event: PopStateEvent) => setPageId(pageIdFromHistory(event.state));
        window.addEventListener("popstate", followHistory);
        return () => window.removeEventListener("popstate", followHistory);
    }, []);

    function openPage(nextPageId: string, { isNew = false } = {}) {
        setNewPageId(isNew ? nextPageId : "");
        if (nextPageId === pageId) return;

        history.pushState({ [HISTORY_PAGE_KEY]: nextPageId }, "", pagePath(nextPageId));
        setPageId(nextPageId);
    }

    function closePage() {
        if (pageIdFromHistory(history.state)) {
            history.back();
        } else {
            setPageId("");
        }
    }

    return { pageId, newPageId, openPage, closePage };
}
