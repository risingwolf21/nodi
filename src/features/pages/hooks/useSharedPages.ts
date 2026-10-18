import { useEffect, useState } from "react";
import { toRequestError } from "@/lib/request-errors";
import { supabase } from "@/lib/supabase";
import { pageTreeCacheFor } from "../services/page-tree-cache";
import type { Page, StoredPage } from "../types";
import { PAGE_COLUMNS, toPage } from "./usePages";

type UseSharedPagesResult = {
    /** Shared pages; a page whose parent is not shared is a root here. */
    pages: Page[];
    error: string;
    fromCache: boolean;
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
    const [pages, setPages] = useState<Page[]>([]);
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
                    setPages(sharedPageTree(cached));
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
                    setPages(sharedPageTree(cached));
                    setFromCache(true);
                }
                return;
            }

            const storedPages = (response.data ?? []) as StoredPage[];
            setPages(sharedPageTree(storedPages));
            setFromCache(false);
            setError("");
            cache.putSharedPages(storedPages).catch((cacheError: unknown) => {
                console.warn("Geteilte Seiten konnten nicht lokal gespeichert werden:", cacheError);
            });
        }

        void load(workspaceKey);

        return () => {
            active = false;
        };
    }, [userId, workspaceKey, reloadCount]);

    return { pages, error, fromCache };
}
