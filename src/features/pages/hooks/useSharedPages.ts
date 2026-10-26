import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toRequestError } from "@/lib/request-errors";
import { supabase } from "@/lib/supabase";
import { useActivityReload } from "@/features/realtime/useActivityReload";
import { isDatabaseEntry } from "../page-hierarchy";
import { pageTreeCacheFor } from "../services/page-tree-cache";
import type { Page, PageSettings, StoredPage } from "../types";
import { loadCacheThenServer, useServerReload } from "./load-cache-then-server";
import { OFFLINE_READ_ONLY_MESSAGE, PAGE_COLUMNS, pageChangeError, parseServerPages, toPage } from "./usePages";

type UseSharedPagesResult = {
    /** Shared pages; a page whose parent is not shared is a root here. */
    pages: Page[];
    error: string;
    fromCache: boolean;
    /** Title and icon; the server checks the edit right (`can_edit_page`). */
    renamePage: (pageId: string, title: string) => Promise<void>;
    updatePage: (pageId: string, settings: PageSettings) => Promise<void>;
};

/** A page whose parent the user cannot see becomes a root of the list. */
export function sharedPageTree(storedPages: StoredPage[]): Page[] {
    const visible = storedPages.filter((page) => !page.is_archived);
    const ids = new Set(visible.map((page) => page.id));
    return visible.map((page) =>
        toPage({ ...page, parent_id: page.parent_id && ids.has(page.parent_id) ? page.parent_id : null }),
    );
}

/**
 * Pages shared with the user from workspaces they are not a member of
 * ("Mit mir geteilt"). Pages of their own workspaces are in the workspace
 * tree already. Cached for reading like the tree (CLAUDE.md §2); RLS
 * decides what the server returns, so a revoked share disappears on the
 * next load.
 */
export function useSharedPages(
    userId: string | undefined,
    /** Undefined while the workspaces are not known yet. */
    workspaceIds: string[] | undefined,
): UseSharedPagesResult {
    // As the server sent them; the tree is derived for display.
    const [storedPages, setStoredPages] = useState<StoredPage[]>([]);
    const [error, setError] = useState("");
    const [fromCache, setFromCache] = useState(false);
    // Server data shown since the last load; only then is the cache written.
    const [confirmedByServer, setConfirmedByServer] = useState(false);
    const reloadCount = useServerReload(fromCache || error !== "");
    // Server data shown for this list: a reload does not show the cache first.
    const shownFromServerFor = useRef<string | null>(null);

    // A stable dependency for the effect below.
    const workspaceKey = workspaceIds?.join(",");
    // Shared pages changed, or a new share (package 36); own workspaces are usePages' job.
    const liveReloads = useActivityReload(
        (activity) =>
            activity.change === "page" && workspaceIds !== undefined && !workspaceIds.includes(activity.workspaceId),
    );

    useEffect(() => {
        if (!userId || workspaceKey === undefined) return;
        const currentUserId = userId;
        const memberOf = workspaceKey;
        let active = true;

        async function load() {
            try {
                await loadCacheThenServer({
                    userId: currentUserId,
                    readCache: () => pageTreeCacheFor(currentUserId).getSharedPages(),
                    fetchServer: async () => {
                        let query = supabase
                            .from("pages")
                            .select(PAGE_COLUMNS)
                            .eq("is_archived", false)
                            .order("created_at", { ascending: true });
                        if (memberOf) query = query.not("workspace_id", "in", `(${memberOf})`);

                        const response = await query;
                        const failure = toRequestError(response);
                        if (failure) throw failure;
                        return parseServerPages(response.data);
                    },
                    cacheFirst: shownFromServerFor.current !== memberOf,
                    isActive: () => active,
                    show: (loaded, cached) => {
                        setStoredPages(loaded);
                        setFromCache(cached);
                        setConfirmedByServer(!cached);
                        if (!cached) shownFromServerFor.current = memberOf;
                    },
                });
                // Offline the cached list (or none) stays; it is optional.
                if (active) setError("");
            } catch (err) {
                if (!active) return;
                console.error("Geteilte Seiten konnten nicht geladen werden:", err);
                setError("Die mit dir geteilten Seiten konnten nicht geladen werden.");
            }
        }

        void load();

        return () => {
            active = false;
        };
    }, [userId, workspaceKey, reloadCount, liveReloads]);

    // Keeps the cache in step with what the server confirmed, including
    // the changes below. A cached list is never written back.
    useEffect(() => {
        if (!userId || !confirmedByServer) return;
        pageTreeCacheFor(userId)
            .putSharedPages(storedPages)
            .catch((cacheError: unknown) => {
                console.warn("Geteilte Seiten konnten nicht lokal gespeichert werden:", cacheError);
            });
    }, [userId, confirmedByServer, storedPages]);

    const pages = useMemo(() => sharedPageTree(storedPages), [storedPages]);

    const update = useCallback(
        async (pageId: string, changes: Partial<Pick<StoredPage, "title" | "icon" | "full_width">>) => {
            if (fromCache) throw new Error(OFFLINE_READ_ONLY_MESSAGE);

            // Not filtered by workspace: the page belongs to someone else's.
            // RLS filters an update without edit rights without an error,
            // so the returned rows tell.
            const response = await supabase
                .from("pages")
                .update(changes)
                .eq("id", pageId)
                .eq("is_archived", false)
                .select("id");

            const failure = pageChangeError(response, "Die Seite konnte nicht geändert werden.");
            if (failure) throw failure;
            if ((response.data ?? []).length === 0) {
                throw new Error("Du darfst diese Seite nicht bearbeiten.");
            }

            // Functional, so two quick changes do not undo each other.
            setStoredPages((current) => current.map((page) => (page.id === pageId ? { ...page, ...changes } : page)));
        },
        [fromCache],
    );

    const renamePage = useCallback(
        async (pageId: string, title: string) => {
            const normalizedTitle = title.trim();
            if (!normalizedTitle && !isDatabaseEntry(pageId, storedPages)) {
                throw new Error("Der Seitentitel darf nicht leer sein.");
            }
            await update(pageId, { title: normalizedTitle });
        },
        [update, storedPages],
    );

    const updatePage = useCallback((pageId: string, settings: PageSettings) => update(pageId, settings), [update]);

    return { pages, error, fromCache, renamePage, updatePage };
}
