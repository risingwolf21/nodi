
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { collectDescendantIds, collectRestoreIds } from "../page-hierarchy";
import type { Page } from "../types";

type StoredPage = Page & {
    is_archived: boolean;
};

type UsePagesResult = {
    pages: Page[];
    archivedPages: Page[];
    loading: boolean;
    error: string;
    createPage: (title: string, parentId: string | null) => Promise<Page>;
    renamePage: (pageId: string, title: string) => Promise<void>;
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

    useEffect(() => {
        let active = true;

        async function load() {
            setLoading(true);
            setError("");

            try {
                if (!workspaceId) {
                    if (active) {
                        setPages([]);
                        setArchivedPages([]);
                    }
                    return;
                }

                const { data, error: loadError } = await supabase
                    .from("pages")
                    .select("id,title,parent_id,is_archived")
                    .eq("workspace_id", workspaceId)
                    .order("created_at", { ascending: true });

                if (loadError) throw loadError;
                if (!active) return;

                const storedPages = (data ?? []) as StoredPage[];

                setPages(
                    storedPages
                        .filter((page) => !page.is_archived)
                        .map(({ id, title, parent_id }) => ({
                            id,
                            title,
                            parent_id,
                        })),
                );

                setArchivedPages(
                    storedPages
                        .filter((page) => page.is_archived)
                        .map(({ id, title, parent_id }) => ({
                            id,
                            title,
                            parent_id,
                        })),
                );
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
    }, [workspaceId]);

    const createPage = useCallback(
        async (title: string, parentId: string | null): Promise<Page> => {
            if (!userId || !workspaceId) {
                throw new Error("Bitte wähle einen Workspace aus.");
            }

            const normalizedTitle = title.trim();

            if (!normalizedTitle) {
                throw new Error("Der Seitentitel darf nicht leer sein.");
            }

            const createdPage: Page = {
                id: crypto.randomUUID(),
                title: normalizedTitle,
                parent_id: parentId,
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
        [userId, workspaceId],
    );

    const renamePage = useCallback(
        async (pageId: string, title: string) => {
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
        [workspaceId],
    );

    const archivePage = useCallback(
        async (pageId: string): Promise<string[]> => {
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
        [pages, archivedPages, workspaceId],
    );

    const restorePage = useCallback(
        async (pageId: string): Promise<string[]> => {
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
        [archivedPages, workspaceId],
    );


    const permanentlyDeletePage = useCallback(
        async (pageId: string): Promise<string[]> => {
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
        [archivedPages, workspaceId],
    );


    return {
        pages,
        archivedPages,
        loading,
        error,
        createPage,
        renamePage,
        archivePage,
        restorePage,
        permanentlyDeletePage,
    };
}
