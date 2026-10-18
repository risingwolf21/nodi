import { useEffect, useState } from "react";
import { hasAccountSession } from "@/lib/account-session";
import { RemoteRequestError } from "@/lib/request-errors";
import { supabase } from "@/lib/supabase";

type LoadOptions<T> = {
    userId: string;
    readCache: () => Promise<T | null>;
    fetchServer: () => Promise<T>;
    /**
     * Shows the cache while the server is asked. False when server data for
     * the same list is shown already, so a reload does not flash back to
     * the (read-only) cache.
     */
    cacheFirst: boolean;
    isActive: () => boolean;
    show: (value: T, fromCache: boolean) => void;
};

/** "server", or offline with ("cache") or without ("none") a cached copy. */
export type LoadResult = "server" | "cache" | "none";

/**
 * Cache first, the server replaces it (CLAUDE.md §4, package 9). Without
 * this account's session the server is not asked: an anonymous answer
 * would show and cache empty lists. Errors other than offline are thrown.
 */
export async function loadCacheThenServer<T>({
    userId,
    readCache,
    fetchServer,
    cacheFirst,
    isActive,
    show,
}: LoadOptions<T>): Promise<LoadResult> {
    let serverAnswered = false;
    const cachedRead = readCache().catch((cacheError: unknown) => {
        console.warn("Lokale Daten sind nicht lesbar:", cacheError);
        return null;
    });
    if (cacheFirst) {
        void cachedRead.then((cached) => {
            if (cached && isActive() && !serverAnswered) show(cached, true);
        });
    }

    try {
        if (!(await hasAccountSession(userId))) {
            throw new RemoteRequestError("offline", "Keine Sitzung für dieses Konto.");
        }
        const value = await fetchServer();
        serverAnswered = true;
        if (isActive()) show(value, false);
        return "server";
    } catch (error) {
        serverAnswered = true;
        if (!(error instanceof RemoteRequestError) || error.reason !== "offline") throw error;

        const cached = await cachedRead;
        if (!cached) return "none";
        if (isActive()) show(cached, true);
        return "cache";
    }
}

/**
 * Counts reasons to ask the server again: back online (only a hint), and
 * while the shown data is stale (cache or error), the app becoming visible
 * or a session becoming usable again.
 */
export function useServerReload(stale: boolean): number {
    const [reloadCount, setReloadCount] = useState(0);

    useEffect(() => {
        const reload = () => setReloadCount((count) => count + 1);
        const reloadWhenVisible = () => {
            if (stale && document.visibilityState === "visible") reload();
        };
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event) => {
            if (stale && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED")) reload();
        });

        window.addEventListener("online", reload);
        document.addEventListener("visibilitychange", reloadWhenVisible);
        return () => {
            window.removeEventListener("online", reload);
            document.removeEventListener("visibilitychange", reloadWhenVisible);
            subscription.unsubscribe();
        };
    }, [stale]);

    return reloadCount;
}
