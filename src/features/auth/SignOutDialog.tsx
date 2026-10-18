import { useState } from "react";
import { Button } from "@/components/ui/button";

type SignOutDialogProps = {
    unsyncedPages: number;
    onCancel: () => void;
    onDiscardAndSignOut: () => Promise<void>;
};

/** Asked when edits could not be synced before signing out (CLAUDE.md §2). */
export function SignOutDialog({
    unsyncedPages,
    onCancel,
    onDiscardAndSignOut,
}: SignOutDialogProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const pages = unsyncedPages === 1 ? "1 Seite enthält" : `${unsyncedPages} Seiten enthalten`;

    async function handleDiscard() {
        setLoading(true);
        setError("");

        try {
            await onDiscardAndSignOut();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Abmelden ist fehlgeschlagen.");
            setLoading(false);
        }
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget && !loading) {
                    onCancel();
                }
            }}
        >
            <section
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="sign-out-title"
                aria-describedby="sign-out-description"
                className="w-full max-w-sm space-y-4 rounded-lg border bg-background p-5 shadow-lg"
            >
                <h2 id="sign-out-title" className="text-lg font-semibold">
                    Änderungen nicht synchronisiert
                </h2>

                <p id="sign-out-description" className="text-sm text-muted-foreground">
                    {pages} Änderungen, die noch nicht auf dem Server sind. Beim
                    Abmelden werden sie zusammen mit allen lokalen Daten dieses
                    Kontos auf diesem Gerät gelöscht.
                </p>

                {error && (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                )}

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onCancel}
                        disabled={loading}
                        autoFocus
                    >
                        Abbrechen
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        className="h-auto whitespace-normal"
                        onClick={() => void handleDiscard()}
                        disabled={loading}
                    >
                        {loading
                            ? "Meldet ab …"
                            : "Trotzdem abmelden und lokale Änderungen verwerfen"}
                    </Button>
                </div>
            </section>
        </div>
    );
}
