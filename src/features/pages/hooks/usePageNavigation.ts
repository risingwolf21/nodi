import { useEffect, useState } from "react";

// Open pages are history entries (without URL change), so the browser and
// Android back button return to the previous page or the page list.
const HISTORY_PAGE_KEY = "nodiPageId";

export function pageIdFromHistory(state: unknown): string {
    if (typeof state !== "object" || state === null || !(HISTORY_PAGE_KEY in state)) return "";
    const pageId = state[HISTORY_PAGE_KEY];
    return typeof pageId === "string" ? pageId : "";
}

/** The open page, kept in the browser history. */
export function usePageNavigation() {
    const [pageId, setPageId] = useState("");
    // A page created just now: its title gets the focus.
    const [newPageId, setNewPageId] = useState("");

    useEffect(() => {
        // An entry left from before a reload would reopen a stale page.
        if (pageIdFromHistory(history.state)) history.replaceState(null, "");

        const followHistory = (event: PopStateEvent) => setPageId(pageIdFromHistory(event.state));
        window.addEventListener("popstate", followHistory);
        return () => window.removeEventListener("popstate", followHistory);
    }, []);

    function openPage(nextPageId: string, { isNew = false } = {}) {
        setNewPageId(isNew ? nextPageId : "");
        if (nextPageId === pageId) return;

        history.pushState({ [HISTORY_PAGE_KEY]: nextPageId }, "");
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
