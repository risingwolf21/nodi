import { useCallback, useEffect, useState } from "react";
import { RemoteRequestError, toRequestError } from "@/lib/request-errors";
import { supabase } from "@/lib/supabase";
import { pageTreeCacheFor } from "../services/page-tree-cache";
import type { Workspace } from "../types";
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
};

async function fetchWorkspaces(userId: string): Promise<Workspace[]> {
    const membershipResponse = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", userId);

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

    return (workspaceResponse.data ?? []) as Workspace[];
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
    const [reloadCount, setReloadCount] = useState(0);

    const show = useCallback((items: Workspace[], cached: boolean) => {
        setWorkspaces(items);
        setWorkspaceId((current) =>
            items.some((item) => item.id === current) ? current : (items[0]?.id ?? ""),
        );
        setFromCache(cached);
    }, []);

    // A hint only: back online, ask the server again.
    useEffect(() => {
        const reload = () => setReloadCount((count) => count + 1);
        window.addEventListener("online", reload);
        return () => window.removeEventListener("online", reload);
    }, []);

    useEffect(() => {
        if (!userId) return;
        let active = true;
        let serverAnswered = false;

        // The cache answers first; the server replaces it when it answers.
        const cachedRead = pageTreeCacheFor(userId)
            .getWorkspaces()
            .catch((cacheError: unknown) => {
                console.warn("Lokale Workspaces sind nicht lesbar:", cacheError);
                return null;
            });
        void cachedRead.then((cached) => {
            if (!cached || !active || serverAnswered) return;
            show(cached, true);
            setLoading(false);
        });

        async function load(currentUserId: string) {
            try {
                const items = await fetchWorkspaces(currentUserId);
                serverAnswered = true;
                if (!active) return;

                show(items, false);
                setError("");
                cacheWorkspaces(currentUserId, items);
            } catch (err) {
                serverAnswered = true;
                if (!active) return;

                if (err instanceof RemoteRequestError && err.reason === "offline") {
                    const cached = await cachedRead;
                    if (!active) return;
                    if (cached) {
                        show(cached, true);
                        return;
                    }
                    setError("Nodi ist offline noch nicht verfügbar. Öffne die App einmal mit Internetverbindung.");
                    return;
                }

                setError(err instanceof Error ? err.message : "Workspaces konnten nicht geladen werden.");
            } finally {
                if (active) setLoading(false);
            }
        }

        void load(userId);

        return () => {
            active = false;
        };
    }, [userId, show, reloadCount]);

    const createWorkspace = useCallback(
        async (name: string) => {
            if (!userId) return;
            if (fromCache) throw new Error(OFFLINE_READ_ONLY_MESSAGE);

            const { data: sessionData } = await supabase.auth.getSession();
            const sessionUser = sessionData.session?.user;

            if (!sessionUser) {
                throw new Error("Keine aktive Supabase-Sitzung.");
            }

            const { error: insertError } = await supabase
                .from("workspaces")
                .insert({
                    name: name.trim(),
                    owner_id: sessionUser.id,
                });

            if (insertError) {
                console.error("Workspace insert failed:", insertError);
                throw new Error(insertError.message);
            }

            const items = await fetchWorkspaces(userId);
            show(items, false);
            cacheWorkspaces(userId, items);
        },
        [userId, fromCache, show],
    );

    return {
        workspaces,
        workspaceId,
        setWorkspaceId,
        loading,
        error,
        fromCache,
        createWorkspace,
    };
}
