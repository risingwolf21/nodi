
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Page } from "../types";

export type PageActionMode = "rename" | "archive";

type PageActionsDialogProps = {
    page: Page;
    mode: PageActionMode;
    onClose: () => void;
    onRename: (pageId: string, title: string) => Promise<void>;
    onArchive: (pageId: string) => Promise<string[]>;
    onArchived: (archivedIds: string[]) => void;
};

export function PageActionsDialog({
    page,
    mode,
    onClose,
    onRename,
    onArchive,
    onArchived,
}: PageActionsDialogProps) {
    const [title, setTitle] = useState(page.title);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    async function handleRename(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        const normalizedTitle = title.trim();

        if (!normalizedTitle) {
            setError("Bitte gib einen Seitentitel ein.");
            return;
        }

        setLoading(true);
        setError("");

        try {
            await onRename(page.id, normalizedTitle);
            onClose();
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Die Seite konnte nicht umbenannt werden.",
            );
        } finally {
            setLoading(false);
        }
    }

    async function handleArchive() {
        setLoading(true);
        setError("");

        try {
            const archivedIds = await onArchive(page.id);
            onArchived(archivedIds);
            onClose();
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Die Seite konnte nicht in den Papierkorb verschoben werden.",
            );
        } finally {
            setLoading(false);
        }
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget && !loading) {
                    onClose();
                }
            }}
        >
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="page-action-title"
                className="w-full max-w-sm space-y-4 rounded-lg border bg-background p-5 shadow-lg"
            >
                <h2 id="page-action-title" className="text-lg font-semibold">
                    {mode === "rename"
                        ? "Seite umbenennen"
                        : "Seite in den Papierkorb verschieben?"}
                </h2>

                {mode === "rename" ? (
                    <form onSubmit={handleRename} className="space-y-4">
                        <Input
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            placeholder="Seitentitel"
                            autoFocus
                            maxLength={200}
                            disabled={loading}
                        />

                        {error && (
                            <p role="alert" className="text-sm text-destructive">
                                {error}
                            </p>
                        )}

                        <div className="flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={onClose}
                                disabled={loading}
                            >
                                Abbrechen
                            </Button>
                            <Button type="submit" disabled={loading}>
                                {loading ? "Speichert …" : "Speichern"}
                            </Button>
                        </div>
                    </form>
                ) : (
                    <>
                        <p className="text-sm text-muted-foreground">
                            „{page.title}“ und alle Unterseiten werden in den
                            Papierkorb verschoben. Die gespeicherten Inhalte
                            bleiben erhalten und können wiederhergestellt werden.
                        </p>

                        {error && (
                            <p role="alert" className="text-sm text-destructive">
                                {error}
                            </p>
                        )}

                        <div className="flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={onClose}
                                disabled={loading}
                            >
                                Abbrechen
                            </Button>
                            <Button
                                type="button"
                                variant="destructive"
                                onClick={() => void handleArchive()}
                                disabled={loading}
                            >
                                {loading ? "Verschiebt …" : "In Papierkorb verschieben"}
                            </Button>
                        </div>
                    </>
                )}
            </section>
        </div>
    );
}
