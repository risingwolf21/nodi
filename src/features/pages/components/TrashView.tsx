
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { Page } from "../types";
import { findArchivedAncestors } from "../page-hierarchy";
import { Undo2, Trash2 } from "lucide-react";

type TrashViewProps = {
    pages: Page[];
    loading?: boolean;
    onRestore: (pageId: string) => Promise<string[]>;
    onDelete: (pageId: string) => Promise<string[]>;
};

export function TrashView({
    pages,
    loading = false,
    onRestore,
    onDelete,
}: TrashViewProps) {
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [pageToDelete, setPageToDelete] = useState<Page | null>(null);
    const [pageToRestore, setPageToRestore] = useState<Page | null>(null);

    // Root first, so the dialog reads like a breadcrumb.
    const ancestorsToRestore = pageToRestore
        ? findArchivedAncestors(pageToRestore.id, pages).reverse()
        : [];

    const pageIds = new Set(pages.map((page) => page.id));
    const childrenByParent = new Map<string | null, Page[]>();

    for (const page of pages) {
        const parentId =
            page.parent_id && pageIds.has(page.parent_id)
                ? page.parent_id
                : null;

        const siblings = childrenByParent.get(parentId) ?? [];
        siblings.push(page);
        childrenByParent.set(parentId, siblings);
    }

    function countDescendants(pageId: string): number {
        const children = childrenByParent.get(pageId) ?? [];

        return children.reduce(
            (count, child) => count + 1 + countDescendants(child.id),
            0,
        );
    }

    async function handleRestore(pageId: string) {
        setBusyId(pageId);
        setError("");

        try {
            await onRestore(pageId);
            setPageToRestore(null);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Die Seite konnte nicht wiederhergestellt werden.",
            );
        } finally {
            setBusyId(null);
        }
    }

    // Archived parent pages are restored too; ask first so that pages
    // the user did not click do not reappear unexpectedly.
    function requestRestore(page: Page) {
        if (findArchivedAncestors(page.id, pages).length > 0) {
            setError("");
            setPageToRestore(page);
            return;
        }

        void handleRestore(page.id);
    }

    async function handleDelete() {
        if (!pageToDelete) return;

        const page = pageToDelete;
        setBusyId(page.id);
        setError("");

        try {
            await onDelete(page.id);
            setPageToDelete(null);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Die Seite konnte nicht endgültig gelöscht werden.",
            );
        } finally {
            setBusyId(null);
        }
    }

    function renderPages(parentId: string | null, depth = 0): ReactNode {
        const children = childrenByParent.get(parentId) ?? [];

        return children.map((page) => (
            <li key={page.id} className="min-w-0">
                <div className="flex min-w-0 items-center gap-1 py-1">
                    <button
                        type="button"
                        title={page.title}
                        onClick={() => requestRestore(page)}
                        className="min-w-0 flex-1 truncate text-left text-sm hover:text-foreground"
                    >
                        {page.title}
                    </button>

                    <div className="flex shrink-0 items-center gap-1">
                        <Button
                            size="icon"
                            variant="ghost"
                            title="Wiederherstellen"
                            aria-label={`„${page.title}“ wiederherstellen`}
                            onClick={() => requestRestore(page)}
                        >
                            <Undo2 className="h-4 w-4" />
                        </Button>

                        <Button
                            size="icon"
                            variant="ghost"
                            title="Endgültig löschen"
                            aria-label={`„${page.title}“ endgültig löschen`}
                            onClick={() => setPageToDelete(page)}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                <ul>{renderPages(page.id, depth + 1)}</ul>
            </li>
        ));
    }

    if (loading) {
        return (
            <p className="p-4 text-sm text-muted-foreground">
                Papierkorb wird geladen …
            </p>
        );
    }

    return (
        <div className="space-y-3 p-3">
            <div>
                <h2 className="text-sm font-semibold">Papierkorb</h2>
                <p className="text-xs text-muted-foreground">
                    Archivierte Seiten und ihre Unterseiten
                </p>
            </div>

            {error && (
                <p className="text-sm text-destructive" role="alert">
                    {error}
                </p>
            )}

            {pages.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                    Der Papierkorb ist leer.
                </p>
            ) : (
                <ul className="space-y-1">{renderPages(null)}</ul>
            )}

            {pageToRestore && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                    onMouseDown={(event) => {
                        if (
                            event.target === event.currentTarget &&
                            busyId === null
                        ) {
                            setPageToRestore(null);
                        }
                    }}
                >
                    <section
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="restore-with-parents-title"
                        className="w-full max-w-md space-y-4 rounded-lg border bg-background p-5 shadow-lg"
                    >
                        <h3
                            id="restore-with-parents-title"
                            className="text-lg font-semibold"
                        >
                            Mit übergeordneten Seiten wiederherstellen?
                        </h3>

                        <p className="text-sm text-muted-foreground">
                            „{pageToRestore.title}“ liegt in einer Seite, die
                            sich ebenfalls im Papierkorb befindet. Damit sie
                            wieder an ihrem Platz erscheint, werden auch diese
                            Seiten wiederhergestellt:{" "}
                            {ancestorsToRestore
                                .map((ancestor) => `„${ancestor.title}“`)
                                .join(" › ")}
                            . Andere Unterseiten bleiben im Papierkorb.
                        </p>

                        {error && (
                            <p role="alert" className="text-sm text-destructive">
                                {error}
                            </p>
                        )}

                        <div className="flex justify-end gap-2">
                            <Button
                                variant="outline"
                                disabled={busyId !== null}
                                onClick={() => setPageToRestore(null)}
                            >
                                Abbrechen
                            </Button>

                            <Button
                                disabled={busyId !== null}
                                onClick={() => void handleRestore(pageToRestore.id)}
                            >
                                {busyId === pageToRestore.id
                                    ? "Stellt wieder her …"
                                    : "Wiederherstellen"}
                            </Button>
                        </div>
                    </section>
                </div>
            )}

            {pageToDelete && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                    onMouseDown={(event) => {
                        if (
                            event.target === event.currentTarget &&
                            busyId === null
                        ) {
                            setPageToDelete(null);
                        }
                    }}
                >
                    <section
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="permanent-delete-title"
                        className="w-full max-w-md space-y-4 rounded-lg border bg-background p-5 shadow-lg"
                    >
                        <h3
                            id="permanent-delete-title"
                            className="text-lg font-semibold"
                        >
                            Endgültig löschen?
                        </h3>

                        <p className="text-sm text-muted-foreground">
                            „{pageToDelete.title}“ wird dauerhaft gelöscht.
                            {countDescendants(pageToDelete.id) > 0 &&
                                ` Zusätzlich werden ${countDescendants(pageToDelete.id)} Unterseite(n) gelöscht.`}
                            {" "}Gespeicherte Inhalte können danach nicht
                            wiederhergestellt werden.
                        </p>

                        {error && (
                            <p role="alert" className="text-sm text-destructive">
                                {error}
                            </p>
                        )}

                        <div className="flex justify-end gap-2">
                            <Button
                                variant="outline"
                                disabled={busyId !== null}
                                onClick={() => setPageToDelete(null)}
                            >
                                Abbrechen
                            </Button>

                            <Button
                                variant="destructive"
                                disabled={busyId !== null}
                                onClick={() => void handleDelete()}
                            >
                                {busyId === pageToDelete.id
                                    ? "Löscht …"
                                    : "Endgültig löschen"}
                            </Button>
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
}
