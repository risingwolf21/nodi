
import { useCallback, useEffect, useState } from "react";
import { RemoteRequestError, toRequestError } from "@/lib/request-errors";
import { supabase } from "@/lib/supabase";
import { collectDescendantIds, collectRestoreIds } from "../page-hierarchy";
import { pageTreeCacheFor } from "../services/page-tree-cache";
import type { Page, PageSection, PageSettings, StoredPage } from "../types";

export const OFFLINE_READ_ONLY_MESSAGE =
    "Offline: Seiten können erst wieder mit Internetverbindung angelegt oder geändert werden.";

// Columns of a page in the tree (StoredPage).
export const PAGE_COLUMNS = "id,title,parent_id,owner_id,visibility,is_archived,icon,full_width";

export const toPage = ({ id, title, parent_id, owner_id, visibility, icon, full_width }: StoredPage): Page => ({
    id,
    title,
    parent_id,
    owner_id,
    visibility,
    icon,
    full_width,
});

type UsePagesResult = {
    pages: Page[];
    archivedPages: Page[];
    loading: boolean;
    error: string;
    /** The tree comes from the local cache because the server is unreachable. */
    fromCache: boolean;
    /** A subpage takes the section of its parent; `section` is for root pages. */
    createPage: (title: string, parentId: string | null, section: PageSection) => Promise<Page>;
    /** Moves a root page with all subpages to the other section (owner only). */
    setPageSection: (pageId: string, section: PageSection) => Promise<void>;
    renamePage: (pageId: string, title: string) => Promise<void>;
    updatePage: (pageId: string, settings: PageSettings) => Promise<void>;
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
                    .select(PAGE_COLUMNS)
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
        async (title: string, parentId: string | null, section: PageSection): Promise<Page> => {
            if (!userId || !workspaceId) {
                throw new Error("Bitte wähle einen Workspace aus.");
            }
            requireOnline();

            const normalizedTitle = title.trim();

            if (!normalizedTitle) {
                throw new Error("Der Seitentitel darf nicht leer sein.");
            }

            // The server enforces it for private parents; a shared parent's
            // subpage is shared as well.
            const parent = parentId ? pages.find((page) => page.id === parentId) : undefined;
            const visibility = parent ? parent.visibility : section;

            const createdPage: Page = {
                id: crypto.randomUUID(),
                title: normalizedTitle,
                parent_id: parentId,
                owner_id: userId,
                visibility,
                icon: null,
                full_width: false,
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
                    visibility,
                    parent_id: parentId,
                });

            if (insertError) throw insertError;

            setPages((current) => [...current, createdPage]);

            return createdPage;
        },
        [userId, workspaceId, pages, requireOnline],
    );

    const setPageSection = useCallback(
        async (pageId: string, section: PageSection) => {
            requireOnline();
            setError("");

            const response = await supabase.rpc("set_page_section", {
                p_page_id: pageId,
                p_visibility: section,
            });
            const failure = toRequestError(response);
            if (failure) {
                console.error("Bereich konnte nicht geändert werden:", failure.reason, failure.message);
                throw new RemoteRequestError(
                    failure.reason,
                    failure.reason === "offline"
                        ? OFFLINE_READ_ONLY_MESSAGE
                        : response.error?.code === "42501"
                          ? "Nur wem die Seite gehört, kann sie verschieben."
                          : "Die Seite konnte nicht verschoben werden.",
                );
            }

            // The whole tree moves; to private, subpages of others become ours.
            const moved = new Set(collectDescendantIds(pageId, [...pages, ...archivedPages]));
            const move = (page: Page): Page =>
                moved.has(page.id)
                    ? {
                          ...page,
                          visibility: section,
                          owner_id: section === "private" && userId ? userId : page.owner_id,
                      }
                    : page;
            setPages((current) => current.map(move));
            setArchivedPages((current) => current.map(move));
        },
        [pages, archivedPages, userId, requireOnline],
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

    const updatePage = useCallback(
        async (pageId: string, settings: PageSettings) => {
            requireOnline();
            setError("");

            const { error: updateError } = await supabase
                .from("pages")
                .update(settings)
                .eq("id", pageId)
                .eq("workspace_id", workspaceId);

            if (updateError) throw updateError;

            setPages((current) =>
                current.map((page) => (page.id === pageId ? { ...page, ...settings } : page)),
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

            // Only the owner may delete for good; RLS filters other
            // deletes without an error, so the returned rows tell.
            const { data: deletedRows, error: deleteError } = await supabase
                .from("pages")
                .delete()
                .eq("workspace_id", workspaceId)
                .eq("is_archived", true)
                .eq("id", pageId)
                .select("id");

            if (deleteError) throw deleteError;
            if (deletedRows.length === 0) {
                throw new Error("Nur der Eigentümer kann diese Seite endgültig löschen.");
            }

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
        setPageSection,
        renamePage,
        updatePage,
        archivePage,
        restorePage,
        permanentlyDeletePage,
    };
}
