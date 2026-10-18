
import { useCallback, useEffect, useRef, useState } from "react";
import { RemoteRequestError, toRequestError } from "@/lib/request-errors";
import { supabase } from "@/lib/supabase";
import { collectDescendantIds, collectRestoreIds, isDatabaseEntry, nextPosition } from "../page-hierarchy";
import { pageTreeCacheFor, parseStoredPages } from "../services/page-tree-cache";
import type { Page, PageKind, PageSection, PageSettings, StoredPage } from "../types";
import { loadCacheThenServer, useServerReload } from "./load-cache-then-server";

export const OFFLINE_READ_ONLY_MESSAGE =
    "Offline: Seiten können erst wieder mit Internetverbindung angelegt oder geändert werden.";

// RLS filters updates without rights silently; the returned rows tell.
const NO_EDIT_RIGHT_MESSAGE = "Du darfst diese Seite nicht bearbeiten.";

type PostgrestResponse = {
    error: { message: string; code?: string } | null;
    status: number;
};

/** A failed change in German; the technical details go to the console. */
export function pageChangeError(response: PostgrestResponse, fallback: string): RemoteRequestError | null {
    const failure = toRequestError(response);
    if (!failure) return null;

    console.error(fallback, failure.reason, failure.message);
    const message =
        failure.reason === "offline"
            ? OFFLINE_READ_ONLY_MESSAGE
            : response.error?.code === "42501"
              ? "Dafür fehlen dir die Rechte."
              : fallback;
    return new RemoteRequestError(failure.reason, message);
}

/** Validates the pages from the server like the cache does. */
export function parseServerPages(data: unknown): StoredPage[] {
    const pages = parseStoredPages(data ?? []);
    if (!pages) throw new Error("Unerwartete Antwort beim Laden der Seiten.");
    return pages;
}

// Columns of a page in the tree (StoredPage).
export const PAGE_COLUMNS =
    "id,title,parent_id,owner_id,visibility,is_archived,icon,full_width,kind,position,created_at";

export const toPage = ({
    id,
    title,
    parent_id,
    owner_id,
    visibility,
    icon,
    full_width,
    kind,
    position,
    created_at,
}: StoredPage): Page => ({
    id,
    title,
    parent_id,
    owner_id,
    visibility,
    icon,
    full_width,
    kind,
    position,
    created_at,
});

type UsePagesResult = {
    pages: Page[];
    archivedPages: Page[];
    loading: boolean;
    error: string;
    /** The tree comes from the local cache because the server is unreachable. */
    fromCache: boolean;
    /** A subpage takes the section of its parent; `section` is for root pages. */
    /** Below a database the page is an entry; it may have an empty title. */
    createPage: (title: string, parentId: string | null, section: PageSection, kind?: PageKind) => Promise<Page>;
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
    // Same, for async changes: their result is dropped after a switch.
    const shownWorkspaceRef = useRef("");
    // Server data shown for this workspace: a reload does not show the cache first.
    const shownFromServerFor = useRef("");
    const reloadCount = useServerReload(fromCache || error !== "");

    useEffect(() => {
        let active = true;

        function show(storedPages: StoredPage[], cached: boolean) {
            setPages(storedPages.filter((page) => !page.is_archived).map(toPage));
            setArchivedPages(storedPages.filter((page) => page.is_archived).map(toPage));
            setShownWorkspaceId(workspaceId);
            shownWorkspaceRef.current = workspaceId;
            setFromCache(cached);
            if (!cached) shownFromServerFor.current = workspaceId;
        }

        async function load() {
            setLoading(true);
            if (shownWorkspaceRef.current !== workspaceId) setError("");

            try {
                if (!workspaceId || !userId) {
                    if (active) {
                        show([], false);
                        setError("");
                    }
                    return;
                }
                const currentUserId = userId;

                const result = await loadCacheThenServer({
                    userId: currentUserId,
                    readCache: () => pageTreeCacheFor(currentUserId).getPages(workspaceId),
                    fetchServer: async () => {
                        const response = await supabase
                            .from("pages")
                            .select(PAGE_COLUMNS)
                            .eq("workspace_id", workspaceId)
                            .order("created_at", { ascending: true });
                        const failure = toRequestError(response);
                        if (failure) throw failure;
                        return parseServerPages(response.data);
                    },
                    cacheFirst: shownFromServerFor.current !== workspaceId,
                    isActive: () => active,
                    show,
                });
                if (!active) return;
                setError(
                    result === "none"
                        ? "Die Seiten sind offline noch nicht verfügbar. Öffne Nodi einmal mit Internetverbindung."
                        : "",
                );
            } catch (err) {
                if (active) {
                    console.error("Seiten konnten nicht geladen werden:", err);
                    setError("Die Seiten konnten nicht geladen werden.");
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

    // While another workspace loads, its predecessor's tree is not shown.
    const showsCurrentWorkspace = shownWorkspaceId === workspaceId;

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
        if (shownWorkspaceRef.current !== workspaceId) {
            throw new Error("Die Seiten werden noch geladen.");
        }
    }, [fromCache, workspaceId]);

    /** The workspace switched while a change was on its way. */
    const switchedSince = useCallback(
        (calledFor: string) => shownWorkspaceRef.current !== calledFor,
        [],
    );

    const createPage = useCallback(
        async (title: string, parentId: string | null, section: PageSection, kind: PageKind = "page"): Promise<Page> => {
            if (!userId || !workspaceId) {
                throw new Error("Bitte wähle einen Workspace aus.");
            }
            requireOnline();

            const normalizedTitle = title.trim();
            // The server enforces it for private parents; a shared parent's
            // subpage is shared as well.
            const parent = parentId ? pages.find((page) => page.id === parentId) : undefined;
            const isEntry = parent?.kind === "database";

            if (!normalizedTitle && !isEntry) {
                throw new Error("Der Seitentitel darf nicht leer sein.");
            }

            const visibility = parent ? parent.visibility : section;
            // A new entry goes to the end of its database.
            const position = isEntry ? nextPosition(pages.filter((page) => page.parent_id === parentId)) : null;

            const createdPage: Page = {
                id: crypto.randomUUID(),
                title: normalizedTitle,
                parent_id: parentId,
                owner_id: userId,
                visibility,
                icon: null,
                full_width: false,
                kind,
                position,
                created_at: new Date().toISOString(),
            };

            setError("");

            const response = await supabase
                .from("pages")
                .insert({
                    id: createdPage.id,
                    workspace_id: workspaceId,
                    owner_id: userId,
                    created_by: userId,
                    title: normalizedTitle,
                    visibility,
                    parent_id: parentId,
                    kind,
                    position,
                });

            const failure = pageChangeError(response, "Die Seite konnte nicht erstellt werden.");
            if (failure) throw failure;

            if (!switchedSince(workspaceId)) setPages((current) => [...current, createdPage]);

            return createdPage;
        },
        [userId, workspaceId, pages, requireOnline, switchedSince],
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
            if (switchedSince(workspaceId)) return;
            setPages((current) => current.map(move));
            setArchivedPages((current) => current.map(move));
        },
        [pages, archivedPages, userId, workspaceId, requireOnline, switchedSince],
    );

    const renamePage = useCallback(
        async (pageId: string, title: string) => {
            requireOnline();
            const normalizedTitle = title.trim();

            if (!normalizedTitle && !isDatabaseEntry(pageId, pages)) {
                throw new Error("Der Seitentitel darf nicht leer sein.");
            }

            setError("");

            const response = await supabase
                .from("pages")
                .update({ title: normalizedTitle })
                .eq("id", pageId)
                .eq("workspace_id", workspaceId)
                .eq("is_archived", false)
                .select("id");

            const failure = pageChangeError(response, "Die Seite konnte nicht umbenannt werden.");
            if (failure) throw failure;
            if ((response.data ?? []).length === 0) throw new Error(NO_EDIT_RIGHT_MESSAGE);
            if (switchedSince(workspaceId)) return;

            setPages((current) =>
                current.map((page) =>
                    page.id === pageId
                        ? { ...page, title: normalizedTitle }
                        : page,
                ),
            );
        },
        [workspaceId, pages, requireOnline, switchedSince],
    );

    const updatePage = useCallback(
        async (pageId: string, settings: PageSettings) => {
            requireOnline();
            setError("");

            const response = await supabase
                .from("pages")
                .update(settings)
                .eq("id", pageId)
                .eq("workspace_id", workspaceId)
                .select("id");

            const failure = pageChangeError(response, "Die Seite konnte nicht geändert werden.");
            if (failure) throw failure;
            if ((response.data ?? []).length === 0) throw new Error(NO_EDIT_RIGHT_MESSAGE);
            if (switchedSince(workspaceId)) return;

            setPages((current) =>
                current.map((page) => (page.id === pageId ? { ...page, ...settings } : page)),
            );
        },
        [workspaceId, requireOnline, switchedSince],
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

            const response = await supabase
                .from("pages")
                .update({ is_archived: true })
                .eq("workspace_id", workspaceId)
                .in("id", ids)
                .eq("is_archived", false)
                .select("id");

            const failure = pageChangeError(response, "Die Seite konnte nicht in den Papierkorb verschoben werden.");
            if (failure) throw failure;

            // Only what the server changed; subpages without edit rights stay.
            const archivedIds = new Set((response.data ?? []).map((row) => row.id));
            if (!archivedIds.has(pageId)) throw new Error(NO_EDIT_RIGHT_MESSAGE);
            if (switchedSince(workspaceId)) return [...archivedIds];

            setPages((current) =>
                current.filter((page) => !archivedIds.has(page.id)),
            );

            setArchivedPages((current) => [
                ...current,
                ...pages.filter((page) => archivedIds.has(page.id)),
            ]);

            return [...archivedIds];
        },
        [pages, archivedPages, workspaceId, requireOnline, switchedSince],
    );

    const restorePage = useCallback(
        async (pageId: string): Promise<string[]> => {
            requireOnline();
            setError("");

            const ids = collectRestoreIds(pageId, archivedPages);

            if (!archivedPages.some((page) => page.id === pageId)) {
                throw new Error("Die archivierte Seite wurde nicht gefunden.");
            }

            const response = await supabase
                .from("pages")
                .update({ is_archived: false })
                .eq("workspace_id", workspaceId)
                .in("id", ids)
                .eq("is_archived", true)
                .select("id");

            const failure = pageChangeError(response, "Die Seite konnte nicht wiederhergestellt werden.");
            if (failure) throw failure;

            const restoredIds = new Set((response.data ?? []).map((row) => row.id));
            if (!restoredIds.has(pageId)) throw new Error(NO_EDIT_RIGHT_MESSAGE);
            if (switchedSince(workspaceId)) return [...restoredIds];

            setArchivedPages((current) =>
                current.filter((page) => !restoredIds.has(page.id)),
            );

            setPages((current) => [
                ...current,
                ...archivedPages.filter((page) =>
                    restoredIds.has(page.id),
                ),
            ]);

            return [...restoredIds];
        },
        [archivedPages, workspaceId, requireOnline, switchedSince],
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
            const response = await supabase
                .from("pages")
                .delete()
                .eq("workspace_id", workspaceId)
                .eq("is_archived", true)
                .eq("id", pageId)
                .select("id");

            const failure = pageChangeError(response, "Die Seite konnte nicht gelöscht werden.");
            if (failure) throw failure;
            if ((response.data ?? []).length === 0) {
                throw new Error("Nur der Eigentümer kann diese Seite endgültig löschen.");
            }
            if (switchedSince(workspaceId)) return ids;

            const deletedIds = new Set(ids);

            setArchivedPages((current) =>
                current.filter((page) => !deletedIds.has(page.id)),
            );

            return ids;
        },
        [archivedPages, workspaceId, requireOnline, switchedSince],
    );


    return {
        pages: showsCurrentWorkspace ? pages : [],
        archivedPages: showsCurrentWorkspace ? archivedPages : [],
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
