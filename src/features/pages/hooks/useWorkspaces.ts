import { useCallback, useEffect, useRef, useState } from "react";
import { toRequestError } from "@/lib/request-errors";
import { supabase } from "@/lib/supabase";
import { pageTreeCacheFor, parseWorkspaces } from "../services/page-tree-cache";
import type { Workspace } from "../types";
import { loadCacheThenServer, useServerReload } from "./load-cache-then-server";
import { OFFLINE_READ_ONLY_MESSAGE } from "./usePages";

type UseWorkspacesResult = {
    workspaces: Workspace[];
    workspaceId: string;
    setWorkspaceId: (workspaceId: string) => void;
    loading: boolean;
    error: string;
    /** The list comes from the local cache because the server is unreachable. */
    fromCache: boolean;
    createWorkspace: (name: string) => Promise<void>;
    /** Loads the list again, e.g. after leaving a workspace. */
    reload: () => void;
};

async function fetchWorkspaces(userId: string): Promise<Workspace[]> {
    const membershipResponse = await supabase.from("workspace_members").select("workspace_id").eq("user_id", userId);

    const membershipFailure = toRequestError(membershipResponse);
    if (membershipFailure) throw membershipFailure;

    const ids = (membershipResponse.data ?? []).map((item) => item.workspace_id);
    if (ids.length === 0) return [];

    const workspaceResponse = await supabase
        .from("workspaces")
        .select("id, name")
        .in("id", ids)
        .order("created_at", { ascending: true });

    const workspaceFailure = toRequestError(workspaceResponse);
    if (workspaceFailure) throw workspaceFailure;

    const workspaces = parseWorkspaces(workspaceResponse.data ?? []);
    if (!workspaces) throw new Error("Unerwartete Antwort beim Laden der Workspaces.");
    return workspaces;
}

function cacheWorkspaces(userId: string, workspaces: Workspace[]): void {
    pageTreeCacheFor(userId)
        .putWorkspaces(workspaces)
        .catch((cacheError: unknown) => {
            console.warn("Workspaces konnten nicht lokal gespeichert werden:", cacheError);
        });
}

export function useWorkspaces(userId: string | undefined): UseWorkspacesResult {
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [workspaceId, setWorkspaceId] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [fromCache, setFromCache] = useState(false);
    // Reloads after a manual request (e.g. leaving a workspace).
    const [manualReloads, setManualReloads] = useState(0);
    const serverReloads = useServerReload(fromCache || error !== "");
    // Server data shown for this account: a reload does not show the cache first.
    const shownFromServerFor = useRef("");

    const show = useCallback((items: Workspace[], cached: boolean) => {
        setWorkspaces(items);
        setWorkspaceId((current) => (items.some((item) => item.id === current) ? current : (items[0]?.id ?? "")));
        setFromCache(cached);
    }, []);

    useEffect(() => {
        if (!userId) return;
        let active = true;

        async function load(currentUserId: string) {
            try {
                const result = await loadCacheThenServer({
                    userId: currentUserId,
                    readCache: () => pageTreeCacheFor(currentUserId).getWorkspaces(),
                    fetchServer: () => fetchWorkspaces(currentUserId),
                    cacheFirst: shownFromServerFor.current !== currentUserId,
                    isActive: () => active,
                    show: (items, cached) => {
                        show(items, cached);
                        setLoading(false);
                        if (cached) return;
                        shownFromServerFor.current = currentUserId;
                        cacheWorkspaces(currentUserId, items);
                    },
                });
                if (!active) return;
                setError(
                    result === "none"
                        ? "Nodi ist offline noch nicht verfügbar. Öffne die App einmal mit Internetverbindung."
                        : "",
                );
            } catch (err) {
                if (!active) return;
                console.error("Workspaces konnten nicht geladen werden:", err);
                setError("Die Workspaces konnten nicht geladen werden.");
            } finally {
                if (active) setLoading(false);
            }
        }

        void load(userId);

        return () => {
            active = false;
        };
    }, [userId, show, manualReloads, serverReloads]);

    const createWorkspace = useCallback(
        async (name: string) => {
            if (!userId) return;
            if (fromCache) throw new Error(OFFLINE_READ_ONLY_MESSAGE);

            const { data: sessionData } = await supabase.auth.getSession();
            const sessionUser = sessionData.session?.user;

            if (!sessionUser) {
                throw new Error("Keine aktive Supabase-Sitzung.");
            }

            const { error: insertError } = await supabase.from("workspaces").insert({
                name: name.trim(),
                owner_id: sessionUser.id,
            });

            if (insertError) {
                console.error("Workspace insert failed:", insertError);
                throw new Error("Der Workspace konnte nicht erstellt werden.");
            }

            const items = await fetchWorkspaces(userId);
            show(items, false);
            cacheWorkspaces(userId, items);
        },
        [userId, fromCache, show],
    );

    const reload = useCallback(() => setManualReloads((count) => count + 1), []);

    return {
        workspaces,
        workspaceId,
        setWorkspaceId,
        loading,
        error,
        fromCache,
        createWorkspace,
        reload,
    };
}
