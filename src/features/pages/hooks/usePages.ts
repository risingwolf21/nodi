import { useCallback, useEffect, useRef, useState } from "react";
import { createDueRecurringEntries } from "@/features/databases/services/recurring-entries";
import { requestDeletedFilesCleanup } from "@/features/files/services/purge-deleted-files";
import { useActivityReload } from "@/features/realtime/useActivityReload";
import { RemoteRequestError, toRequestError } from "@/lib/request-errors";
import { supabase } from "@/lib/supabase";
import {
    collectDescendantIds,
    collectRestoreIds,
    isDatabaseEntry,
    nextPosition,
    type MoveTarget,
    type PositionUpdate,
} from "../page-hierarchy";
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
    "id,title,parent_id,owner_id,visibility,is_archived,icon,full_width,kind,position,created_at,is_template,cover," +
    "default_template_id," +
    // Only the user's own favorites (RLS), package 30b.
    "favorites:page_favorites(created_at)";

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
    is_template,
    favorite,
    cover,
    default_template_id,
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
    ...(is_template ? { is_template } : {}),
    ...(favorite ? { favorite } : {}),
    ...(cover ? { cover } : {}),
    ...(default_template_id ? { default_template_id } : {}),
});

export type NewPageOptions = {
    /** Known before the page exists, e.g. for links to it (Notion import). */
    id?: string;
    /** A template of its database (package 26). */
    isTemplate?: boolean;
};

type UsePagesResult = {
    pages: Page[];
    archivedPages: Page[];
    loading: boolean;
    error: string;
    /** The tree comes from the local cache because the server is unreachable. */
    fromCache: boolean;
    /** A subpage takes the section of its parent; `section` is for root pages. */
    /** Below a database the page is an entry; it may have an empty title. */
    createPage: (
        title: string,
        parentId: string | null,
        section: PageSection,
        kind?: PageKind,
        options?: NewPageOptions,
    ) => Promise<Page>;
    /** A new entry from a template of its database (RPC create_entry_from_template, package 26). */
    createEntryFromTemplate: (templateId: string) => Promise<Page>;
    /** Moves a root page with all subpages to the other section (owner only). */
    setPageSection: (pageId: string, section: PageSection) => Promise<void>;
    /** Below another page (or into a database) or to the top of a section (RPC move_page, package 18). */
    movePage: (pageId: string, target: MoveTarget) => Promise<void>;
    renamePage: (pageId: string, title: string) => Promise<void>;
    updatePage: (pageId: string, settings: PageSettings) => Promise<void>;
    /** Adds the page to the user's favorites or removes it (package 30b). */
    setFavorite: (pageId: string, favorite: boolean) => Promise<void>;
    /** New manual order of siblings or entries (package 32a, `placeBefore`). */
    reorderPages: (updates: PositionUpdate[]) => Promise<void>;
    archivePage: (pageId: string) => Promise<string[]>;
    /** Deletes the user's pages in the trash for good (with their subpages); how many. */
    emptyTrash: () => Promise<number>;
    restorePage: (pageId: string) => Promise<string[]>;
    permanentlyDeletePage: (pageId: string) => Promise<string[]>;
};

// The ids go into the URL (`id=in.(…)`); a few hundred make it too long
// (414, e.g. a Notion import in the trash). Whole trees go in parts.
const IDS_PER_REQUEST = 100;

/**
 * Moves pages to or out of the trash, in parts. Returns what the server
 * changed (RLS leaves pages without edit rights out) and the first failure.
 */
async function setArchived(
    workspaceId: string,
    ids: string[],
    archived: boolean,
    failureMessage: string,
): Promise<{ changedIds: Set<string>; failure: Error | null }> {
    const changedIds = new Set<string>();
    for (let start = 0; start < ids.length; start += IDS_PER_REQUEST) {
        const response = await supabase
            .from("pages")
            .update({ is_archived: archived })
            .eq("workspace_id", workspaceId)
            .in("id", ids.slice(start, start + IDS_PER_REQUEST))
            .eq("is_archived", !archived)
            .select("id");
        const failure = pageChangeError(response, failureMessage);
        if (failure) return { changedIds, failure };
        for (const row of response.data ?? []) changedIds.add(row.id);
    }
    return { changedIds, failure: null };
}

export function usePages(workspaceId: string, userId: string | undefined): UsePagesResult {
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
    // Pages changed elsewhere in this workspace (package 36).
    const liveReloads = useActivityReload(
        (activity) => activity.change === "page" && activity.workspaceId === workspaceId,
    );
    const liveReloadsLoaded = useRef(0);
    // Pages created here; a live reload that started before one of them is not shown
    // (it would drop it until the next change; the Notion import creates many in a row).
    const localCreates = useRef(0);
    // After a move the server decides what changed below the page (section, owner, position).
    const [movesToLoad, setMovesToLoad] = useState(0);
    // The newest pages for createPage, which may run several times before
    // React renders again (Notion import: a database, then its entries).
    const latestPages = useRef<Page[]>([]);
    useEffect(() => {
        latestPages.current = pages;
    }, [pages]);

    useEffect(() => {
        let active = true;
        const live = liveReloads !== liveReloadsLoaded.current;
        liveReloadsLoaded.current = liveReloads;
        const createsAtStart = localCreates.current;
        const current = () => active && (!live || localCreates.current === createsAtStart);

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
                        // Recurring entries that are due appear with this load (package 25). Without
                        // them the tree still loads; they come with the next one.
                        await createDueRecurringEntries(workspaceId).catch((err: unknown) => {
                            console.error("Wiederkehrende Einträge konnten nicht angelegt werden:", err);
                        });
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
                    isActive: current,
                    show,
                });
                if (!current()) return;
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
    }, [workspaceId, userId, reloadCount, movesToLoad, liveReloads]);

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
    const switchedSince = useCallback((calledFor: string) => shownWorkspaceRef.current !== calledFor, []);

    const createPage = useCallback(
        async (
            title: string,
            parentId: string | null,
            section: PageSection,
            kind: PageKind = "page",
            options: NewPageOptions = {},
        ): Promise<Page> => {
            const id = options.id ?? crypto.randomUUID();
            const isTemplate = options.isTemplate === true;
            if (!userId || !workspaceId) {
                throw new Error("Bitte wähle einen Workspace aus.");
            }
            requireOnline();

            const normalizedTitle = title.trim();
            // The server enforces it for private parents; a shared parent's
            // subpage is shared as well.
            const parent = parentId ? latestPages.current.find((page) => page.id === parentId) : undefined;
            const isEntry = parent?.kind === "database";

            if (!normalizedTitle && !isEntry) {
                throw new Error("Der Seitentitel darf nicht leer sein.");
            }

            const visibility = parent ? parent.visibility : section;
            // A new entry goes to the end of its database.
            const position = isEntry
                ? nextPosition(latestPages.current.filter((page) => page.parent_id === parentId))
                : null;

            const createdPage: Page = {
                id,
                title: normalizedTitle,
                parent_id: parentId,
                owner_id: userId,
                visibility,
                icon: null,
                full_width: false,
                kind,
                position,
                created_at: new Date().toISOString(),
                ...(isTemplate ? { is_template: true } : {}),
            };

            setError("");

            localCreates.current += 1;
            const response = await supabase.from("pages").insert({
                id: createdPage.id,
                workspace_id: workspaceId,
                owner_id: userId,
                created_by: userId,
                title: normalizedTitle,
                visibility,
                parent_id: parentId,
                kind,
                position,
                ...(isTemplate ? { is_template: true } : {}),
            });

            const failure = pageChangeError(response, "Die Seite konnte nicht erstellt werden.");
            if (failure) throw failure;

            if (!switchedSince(workspaceId)) {
                latestPages.current = [...latestPages.current, createdPage];
                setPages((current) => [...current, createdPage]);
            }

            return createdPage;
        },
        [userId, workspaceId, requireOnline, switchedSince],
    );

    const createEntryFromTemplate = useCallback(
        async (templateId: string): Promise<Page> => {
            if (!userId) throw new Error("Bitte melde dich an.");
            requireOnline();
            const template = latestPages.current.find((page) => page.id === templateId);
            if (!template?.parent_id) throw new Error("Diese Vorlage gibt es nicht mehr.");
            setError("");

            const response = await supabase.rpc("create_entry_from_template", { p_template_id: templateId });
            const failure = pageChangeError(response, "Der Eintrag konnte nicht angelegt werden.");
            if (failure) throw failure;
            if (typeof response.data !== "string") throw new Error("Unerwartete Antwort beim Anlegen des Eintrags.");

            // At once in the database; values and text come from the server with the reload.
            const created: Page = {
                ...template,
                id: response.data,
                owner_id: userId,
                position: nextPosition(latestPages.current.filter((page) => page.parent_id === template.parent_id)),
                created_at: new Date().toISOString(),
                is_template: false,
            };
            if (!switchedSince(workspaceId)) {
                latestPages.current = [...latestPages.current, created];
                setPages((current) => [...current, created]);
                setMovesToLoad((count) => count + 1);
            }
            return created;
        },
        [userId, workspaceId, requireOnline, switchedSince],
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

    const movePage = useCallback(
        async (pageId: string, target: MoveTarget) => {
            requireOnline();
            setError("");

            const response = await supabase.rpc("move_page", {
                p_page_id: pageId,
                p_parent_id: "parentId" in target ? target.parentId : null,
                p_section: "section" in target ? target.section : null,
            });
            const failure = toRequestError(response);
            if (failure) {
                console.error("Seite konnte nicht verschoben werden:", failure.reason, failure.message);
                throw new RemoteRequestError(
                    failure.reason,
                    failure.reason === "offline"
                        ? OFFLINE_READ_ONLY_MESSAGE
                        : response.error?.code === "42501"
                          ? "Dafür fehlen dir die Rechte: Du brauchst Schreibrecht auf Seite und Ziel, und einen anderen Bereich wählt nur, wem die Seite gehört."
                          : response.error?.code === "22023"
                            ? "Dorthin kann die Seite nicht verschoben werden."
                            : "Die Seite konnte nicht verschoben werden.",
                );
            }

            if (switchedSince(workspaceId)) return;
            // At once in the tree; the rest comes with the reload.
            const parentId = "parentId" in target ? target.parentId : null;
            setPages((current) => {
                // The page takes the section of its new place.
                const section =
                    "section" in target ? target.section : current.find((page) => page.id === parentId)?.visibility;
                return current.map((page) =>
                    page.id === pageId
                        ? { ...page, parent_id: parentId, visibility: section ?? page.visibility }
                        : page,
                );
            });
            setMovesToLoad((count) => count + 1);
        },
        [workspaceId, requireOnline, switchedSince],
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
                current.map((page) => (page.id === pageId ? { ...page, title: normalizedTitle } : page)),
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

            setPages((current) => current.map((page) => (page.id === pageId ? { ...page, ...settings } : page)));
        },
        [workspaceId, requireOnline, switchedSince],
    );

    const setFavorite = useCallback(
        async (pageId: string, favorite: boolean) => {
            requireOnline();
            setError("");

            const response = favorite
                ? await supabase.from("page_favorites").insert({ page_id: pageId })
                : await supabase.from("page_favorites").delete().eq("page_id", pageId);
            const failure = pageChangeError(
                response,
                favorite
                    ? "Die Seite konnte nicht zu den Favoriten hinzugefügt werden."
                    : "Der Favorit konnte nicht entfernt werden.",
            );
            if (failure) throw failure;
            if (switchedSince(workspaceId)) return;

            setPages((current) => current.map((page) => (page.id === pageId ? { ...page, favorite } : page)));
        },
        [workspaceId, requireOnline, switchedSince],
    );

    const reorderPages = useCallback(
        async (updates: PositionUpdate[]) => {
            if (updates.length === 0) return;
            requireOnline();
            setError("");

            const positions = new Map(updates.map((update) => [update.id, update.position]));
            // Shown at once; the server's answer decides.
            setPages((current) =>
                current.map((page) =>
                    positions.has(page.id) ? { ...page, position: positions.get(page.id) ?? null } : page,
                ),
            );
            const responses = await Promise.all(
                updates.map((update) =>
                    supabase
                        .from("pages")
                        .update({ position: update.position })
                        .eq("id", update.id)
                        .eq("workspace_id", workspaceId)
                        .select("id"),
                ),
            );
            const failure = responses
                .map((response) => pageChangeError(response, "Die Reihenfolge konnte nicht gespeichert werden."))
                .find((item) => item !== null);
            const refused = responses.some((response) => (response.data ?? []).length === 0);
            if (failure || refused) {
                setMovesToLoad((count) => count + 1);
                throw failure ?? new Error(NO_EDIT_RIGHT_MESSAGE);
            }
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

            const { changedIds: archivedIds, failure } = await setArchived(
                workspaceId,
                ids,
                true,
                "Die Seite konnte nicht in den Papierkorb verschoben werden.",
            );
            // What the server changed before a failure is shown as well.
            if (!switchedSince(workspaceId)) {
                setPages((current) => current.filter((page) => !archivedIds.has(page.id)));
                setArchivedPages((current) => [...current, ...pages.filter((page) => archivedIds.has(page.id))]);
            }
            if (failure) throw failure;

            // Only what the server changed; subpages without edit rights stay.
            if (!archivedIds.has(pageId)) throw new Error(NO_EDIT_RIGHT_MESSAGE);
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

            const { changedIds: restoredIds, failure } = await setArchived(
                workspaceId,
                ids,
                false,
                "Die Seite konnte nicht wiederhergestellt werden.",
            );
            if (!switchedSince(workspaceId)) {
                setArchivedPages((current) => current.filter((page) => !restoredIds.has(page.id)));
                setPages((current) => [...current, ...archivedPages.filter((page) => restoredIds.has(page.id))]);
            }
            if (failure) throw failure;

            if (!restoredIds.has(pageId)) throw new Error(NO_EDIT_RIGHT_MESSAGE);
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
                throw new Error("Nur archivierte Seiten können endgültig gelöscht werden.");
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
            requestDeletedFilesCleanup();
            if (switchedSince(workspaceId)) return ids;

            const deletedIds = new Set(ids);

            setArchivedPages((current) => current.filter((page) => !deletedIds.has(page.id)));

            return ids;
        },
        [archivedPages, workspaceId, requireOnline, switchedSince],
    );

    /**
     * Deletes every page of the trash that belongs to the user, in one
     * request (no id list in the URL: large trees, 19a); their subpages go
     * with them. Pages of others stay. Returns how many were deleted.
     */
    const emptyTrash = useCallback(async (): Promise<number> => {
        if (!userId) throw new Error("Bitte melde dich an.");
        requireOnline();
        setError("");

        const response = await supabase
            .from("pages")
            .delete()
            .eq("workspace_id", workspaceId)
            .eq("is_archived", true)
            .eq("owner_id", userId)
            .select("id");
        const failure = pageChangeError(response, "Der Papierkorb konnte nicht geleert werden.");
        if (failure) throw failure;
        const deleted = response.data ?? [];
        if (deleted.length > 0) requestDeletedFilesCleanup();
        if (switchedSince(workspaceId)) return deleted.length;

        const deletedIds = new Set(deleted.flatMap((row) => collectDescendantIds(row.id, archivedPages)));
        setArchivedPages((current) => current.filter((page) => !deletedIds.has(page.id)));
        // Cascades the answer does not list (subpages of others) come with the reload.
        setMovesToLoad((count) => count + 1);
        return deleted.length;
    }, [archivedPages, userId, workspaceId, requireOnline, switchedSince]);

    return {
        pages: showsCurrentWorkspace ? pages : [],
        archivedPages: showsCurrentWorkspace ? archivedPages : [],
        // Also before the first load of a new workspace has started.
        loading: loading || !showsCurrentWorkspace,
        error,
        fromCache,
        createPage,
        createEntryFromTemplate,
        setPageSection,
        movePage,
        renamePage,
        updatePage,
        setFavorite,
        reorderPages,
        archivePage,
        restorePage,
        permanentlyDeletePage,
        emptyTrash,
    };
}
