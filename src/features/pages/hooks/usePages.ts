
import { useCallback, useEffect, useState } from "react";
import { toRequestError } from "@/lib/request-errors";
import { supabase } from "@/lib/supabase";
import { collectDescendantIds, collectRestoreIds } from "../page-hierarchy";
import { pageTreeCacheFor } from "../services/page-tree-cache";
import type { Page, StoredPage } from "../types";

export const OFFLINE_READ_ONLY_MESSAGE =
    "Offline: Seiten können erst wieder mit Internetverbindung angelegt oder geändert werden.";

const toPage = ({ id, title, parent_id, icon }: StoredPage): Page => ({
    id,
    title,
    parent_id,
    icon,
});

type UsePagesResult = {
    pages: Page[];
    archivedPages: Page[];
    loading: boolean;
    error: string;
    /** The tree comes from the local cache because the server is unreachable. */
    fromCache: boolean;
    createPage: (title: string, parentId: string | null) => Promise<Page>;
    renamePage: (pageId: string, title: string) => Promise<void>;
    setPageIcon: (pageId: string, icon: string | null) => Promise<void>;
    archivePage: (pageId: string) => Promise<string[]>;
    restorePage: (pageId: string) => Promise<string[]>;
    permanentlyDeletePage: (pageId: string) => Promise<string[]>;
};

export function usePages(
    workspaceId: string,
    userId: string | undefined,
): UsePagesResult {
    const [pages, setPages] = useState<Page[]>([]);
    const [archivedPages, setArchivedPages] = useState<Page[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [fromCache, setFromCache] = useState(false);
    // Workspace the shown pages belong to; guards the cache write below.
    const [shownWorkspaceId, setShownWorkspaceId] = useState("");
    const [reloadCount, setReloadCount] = useState(0);

    // A hint only: back online, ask the server again.
    useEffect(() => {
        const reload = () => setReloadCount((count) => count + 1);
        window.addEventListener("online", reload);
        return () => window.removeEventListener("online", reload);
    }, []);

    useEffect(() => {
        let active = true;
        let serverAnswered = false;

        function show(storedPages: StoredPage[], cached: boolean) {
            setPages(storedPages.filter((page) => !page.is_archived).map(toPage));
            setArchivedPages(storedPages.filter((page) => page.is_archived).map(toPage));
            setShownWorkspaceId(workspaceId);
            setFromCache(cached);
        }

        async function load() {
            setLoading(true);
            setError("");

            try {
                if (!workspaceId || !userId) {
                    if (active) show([], false);
                    return;
                }

                // The cache answers first; the server replaces it when it answers.
                const cachedRead = pageTreeCacheFor(userId)
                    .getPages(workspaceId)
                    .catch((cacheError: unknown) => {
                        console.warn("Lokaler Seitenbaum ist nicht lesbar:", cacheError);
                        return null;
                    });
                void cachedRead.then((cached) => {
                    if (cached && active && !serverAnswered) show(cached, true);
                });

                const response = await supabase
                    .from("pages")
                    .select("id,title,parent_id,is_archived,icon")
                    .eq("workspace_id", workspaceId)
                    .order("created_at", { ascending: true });
                serverAnswered = true;
                if (!active) return;

                const failure = toRequestError(response);
                if (failure?.reason === "offline") {
                    const cached = await cachedRead;
                    if (!active) return;
                    if (cached) {
                        show(cached, true);
                        return;
                    }
                    throw new Error(
                        "Die Seiten sind offline noch nicht verfügbar. Öffne Nodi einmal mit Internetverbindung.",
                    );
                }
                if (failure) throw failure;

                show((response.data ?? []) as StoredPage[], false);
            } catch (err) {
                if (active) {
                    setError(
                        err instanceof Error
                            ? err.message
                            : "Seiten konnten nicht geladen werden.",
                    );
                }
            } finally {
                if (active) setLoading(false);
            }
        }

        void load();

        return () => {
            active = false;
        };
    }, [workspaceId, userId, reloadCount]);

    // Keeps the cache in step with what the server confirmed, including
    // the changes below. A cached tree is never written back.
    useEffect(() => {
        if (!userId || !shownWorkspaceId || fromCache) return;

        const storedPages: StoredPage[] = [
            ...pages.map((page) => ({ ...page, is_archived: false })),
            ...archivedPages.map((page) => ({ ...page, is_archived: true })),
        ];
        pageTreeCacheFor(userId)
            .putPages(shownWorkspaceId, storedPages)
            .catch((cacheError: unknown) => {
                console.warn("Seitenbaum konnte nicht lokal gespeichert werden:", cacheError);
            });
    }, [userId, shownWorkspaceId, fromCache, pages, archivedPages]);

    const requireOnline = useCallback(() => {
        if (fromCache) throw new Error(OFFLINE_READ_ONLY_MESSAGE);
    }, [fromCache]);

    const createPage = useCallback(
        async (title: string, parentId: string | null): Promise<Page> => {
            if (!userId || !workspaceId) {
                throw new Error("Bitte wähle einen Workspace aus.");
            }
            requireOnline();

            const normalizedTitle = title.trim();

            if (!normalizedTitle) {
                throw new Error("Der Seitentitel darf nicht leer sein.");
            }

            const createdPage: Page = {
                id: crypto.randomUUID(),
                title: normalizedTitle,
                parent_id: parentId,
                icon: null,
            };

            setError("");

            const { error: insertError } = await supabase
                .from("pages")
                .insert({
                    id: createdPage.id,
                    workspace_id: workspaceId,
                    owner_id: userId,
                    created_by: userId,
                    title: normalizedTitle,
                    visibility: "workspace",
                    parent_id: parentId,
                });

            if (insertError) throw insertError;

            setPages((current) => [...current, createdPage]);

            return createdPage;
        },
        [userId, workspaceId, requireOnline],
    );

    const renamePage = useCallback(
        async (pageId: string, title: string) => {
            requireOnline();
            const normalizedTitle = title.trim();

            if (!normalizedTitle) {
                throw new Error("Der Seitentitel darf nicht leer sein.");
            }

            setError("");

            const { error: updateError } = await supabase
                .from("pages")
                .update({ title: normalizedTitle })
                .eq("id", pageId)
                .eq("workspace_id", workspaceId)
                .eq("is_archived", false);

            if (updateError) throw updateError;

            setPages((current) =>
                current.map((page) =>
                    page.id === pageId
                        ? { ...page, title: normalizedTitle }
                        : page,
                ),
            );
        },
        [workspaceId, requireOnline],
    );

    const setPageIcon = useCallback(
        async (pageId: string, icon: string | null) => {
            requireOnline();
            setError("");

            const { error: updateError } = await supabase
                .from("pages")
                .update({ icon })
                .eq("id", pageId)
                .eq("workspace_id", workspaceId);

            if (updateError) throw updateError;

            setPages((current) =>
                current.map((page) => (page.id === pageId ? { ...page, icon } : page)),
            );
        },
        [workspaceId, requireOnline],
    );

    const archivePage = useCallback(
        async (pageId: string): Promise<string[]> => {
            requireOnline();
            setError("");

            const allPages = [...pages, ...archivedPages];
            const ids = collectDescendantIds(pageId, allPages);

            if (!pages.some((page) => page.id === pageId)) {
                throw new Error("Die Seite wurde nicht gefunden.");
            }

            const { error: archiveError } = await supabase
                .from("pages")
                .update({ is_archived: true })
                .eq("workspace_id", workspaceId)
                .in("id", ids)
                .eq("is_archived", false);

            if (archiveError) throw archiveError;

            const archivedIds = new Set(ids);

            setPages((current) =>
                current.filter((page) => !archivedIds.has(page.id)),
            );

            setArchivedPages((current) => [
                ...current,
                ...pages.filter((page) => archivedIds.has(page.id)),
            ]);

            return ids;
        },
        [pages, archivedPages, workspaceId, requireOnline],
    );

    const restorePage = useCallback(
        async (pageId: string): Promise<string[]> => {
            requireOnline();
            setError("");

            const ids = collectRestoreIds(pageId, archivedPages);

            if (!archivedPages.some((page) => page.id === pageId)) {
                throw new Error("Die archivierte Seite wurde nicht gefunden.");
            }

            const { error: restoreError } = await supabase
                .from("pages")
                .update({ is_archived: false })
                .eq("workspace_id", workspaceId)
                .in("id", ids)
                .eq("is_archived", true);

            if (restoreError) throw restoreError;

            const restoredIds = new Set(ids);

            setArchivedPages((current) =>
                current.filter((page) => !restoredIds.has(page.id)),
            );

            setPages((current) => [
                ...current,
                ...archivedPages.filter((page) =>
                    restoredIds.has(page.id),
                ),
            ]);

            return ids;
        },
        [archivedPages, workspaceId, requireOnline],
    );


    const permanentlyDeletePage = useCallback(
        async (pageId: string): Promise<string[]> => {
            requireOnline();
            setError("");

            const ids = collectDescendantIds(pageId, archivedPages);

            if (!archivedPages.some((page) => page.id === pageId)) {
                throw new Error(
                    "Nur archivierte Seiten können endgültig gelöscht werden.",
                );
            }

            const { error: deleteError } = await supabase
                .from("pages")
                .delete()
                .eq("workspace_id", workspaceId)
                .eq("is_archived", true)
                .eq("id", pageId);

            if (deleteError) throw deleteError;

            const deletedIds = new Set(ids);

            setArchivedPages((current) =>
                current.filter((page) => !deletedIds.has(page.id)),
            );

            return ids;
        },
        [archivedPages, workspaceId, requireOnline],
    );


    return {
        pages,
        archivedPages,
        loading,
        error,
        fromCache,
        createPage,
        renamePage,
        setPageIcon,
        archivePage,
        restorePage,
        permanentlyDeletePage,
    };
}
