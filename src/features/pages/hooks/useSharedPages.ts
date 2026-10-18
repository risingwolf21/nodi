import { useCallback, useEffect, useMemo, useState } from "react";
import { toRequestError } from "@/lib/request-errors";
import { supabase } from "@/lib/supabase";
import { pageTreeCacheFor } from "../services/page-tree-cache";
import type { Page, PageSettings, StoredPage } from "../types";
import { OFFLINE_READ_ONLY_MESSAGE, PAGE_COLUMNS, toPage } from "./usePages";

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
    const [reloadCount, setReloadCount] = useState(0);

    // A stable dependency for the effect below.
    const workspaceKey = workspaceIds?.join(",");

    useEffect(() => {
        const reload = () => setReloadCount((count) => count + 1);
        window.addEventListener("online", reload);
        return () => window.removeEventListener("online", reload);
    }, []);

    useEffect(() => {
        if (!userId || workspaceKey === undefined) return;
        const cache = pageTreeCacheFor(userId);
        let active = true;
        let serverAnswered = false;

        async function load(memberOf: string) {
            const cachedRead = cache.getSharedPages().catch((cacheError: unknown) => {
                console.warn("Lokale Liste geteilter Seiten ist nicht lesbar:", cacheError);
                return null;
            });
            void cachedRead.then((cached) => {
                if (cached && active && !serverAnswered) {
                    setStoredPages(cached);
                    setFromCache(true);
                }
            });

            let query = supabase
                .from("pages")
                .select(PAGE_COLUMNS)
                .eq("is_archived", false)
                .order("created_at", { ascending: true });
            if (memberOf) query = query.not("workspace_id", "in", `(${memberOf})`);

            const response = await query;
            serverAnswered = true;
            if (!active) return;

            const failure = toRequestError(response);
            if (failure) {
                // Offline the cached list (or none) stays; it is optional.
                if (failure.reason !== "offline") {
                    console.error("Geteilte Seiten konnten nicht geladen werden:", failure.message);
                    setError("Die mit dir geteilten Seiten konnten nicht geladen werden.");
                }
                const cached = await cachedRead;
                if (active && cached) {
                    setStoredPages(cached);
                    setFromCache(true);
                }
                return;
            }

            const loaded = (response.data ?? []) as StoredPage[];
            setStoredPages(loaded);
            setFromCache(false);
            setError("");
            cache.putSharedPages(loaded).catch((cacheError: unknown) => {
                console.warn("Geteilte Seiten konnten nicht lokal gespeichert werden:", cacheError);
            });
        }

        void load(workspaceKey);

        return () => {
            active = false;
        };
    }, [userId, workspaceKey, reloadCount]);

    const pages = useMemo(() => sharedPageTree(storedPages), [storedPages]);

    const update = useCallback(
        async (pageId: string, changes: Partial<Pick<StoredPage, "title" | "icon" | "full_width">>) => {
            if (fromCache) throw new Error(OFFLINE_READ_ONLY_MESSAGE);

            // Not filtered by workspace: the page belongs to someone else's.
            // RLS filters an update without edit rights without an error,
            // so the returned rows tell.
            const { data, error: updateError } = await supabase
                .from("pages")
                .update(changes)
                .eq("id", pageId)
                .eq("is_archived", false)
                .select("id");

            if (updateError) throw updateError;
            if (data.length === 0) {
                throw new Error("Du darfst diese Seite nicht bearbeiten.");
            }

            const next = storedPages.map((page) => (page.id === pageId ? { ...page, ...changes } : page));
            setStoredPages(next);
            if (userId) {
                pageTreeCacheFor(userId)
                    .putSharedPages(next)
                    .catch((cacheError: unknown) => {
                        console.warn("Geteilte Seiten konnten nicht lokal gespeichert werden:", cacheError);
                    });
            }
        },
        [fromCache, storedPages, userId],
    );

    const renamePage = useCallback(
        async (pageId: string, title: string) => {
            const normalizedTitle = title.trim();
            if (!normalizedTitle) throw new Error("Der Seitentitel darf nicht leer sein.");
            await update(pageId, { title: normalizedTitle });
        },
        [update],
    );

    const updatePage = useCallback(
        (pageId: string, settings: PageSettings) => update(pageId, settings),
        [update],
    );

    return { pages, error, fromCache, renamePage, updatePage };
}
