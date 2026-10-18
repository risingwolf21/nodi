import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

type ConfirmDialogProps = {
    title: string;
    message: string;
    confirmLabel: string;
    onCancel: () => void;
    onConfirm: () => Promise<void>;
};

/** Asked before something that cannot be undone, e.g. deleting a property. */
export function ConfirmDialog({ title, message, confirmLabel, onCancel, onConfirm }: ConfirmDialogProps) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    async function confirm() {
        setBusy(true);
        setError("");
        try {
            await onConfirm();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Das hat nicht geklappt.");
            setBusy(false);
        }
    }

    return (
        <Dialog role="alertdialog" labelledBy="confirm-title" onClose={onCancel} busy={busy}>
            <h2 id="confirm-title" className="text-lg font-semibold">
                {title}
            </h2>
            <p className="text-sm text-muted-foreground">{message}</p>
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
            <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
                    Abbrechen
                </Button>
                <Button type="button" variant="destructive" onClick={() => void confirm()} disabled={busy}>
                    {confirmLabel}
                </Button>
            </div>
        </Dialog>
    );
}
