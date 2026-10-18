import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { Page, PageSection } from "../types";

type MoveSectionDialogProps = {
    page: Page;
    target: PageSection;
    onClose: () => void;
    onMove: (pageId: string, target: PageSection) => Promise<void>;
};

/** Asked before a root page and its subpages change their section. */
export function MoveSectionDialog({ page, target, onClose, onMove }: MoveSectionDialogProps) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    async function move() {
        setBusy(true);
        setError("");
        try {
            await onMove(page.id, target);
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Die Seite konnte nicht verschoben werden.");
            setBusy(false);
        }
    }

    return (
        <Dialog role="alertdialog" labelledBy="move-section-title" onClose={onClose} busy={busy}>
            <h2 id="move-section-title" className="text-lg font-semibold">
                {target === "workspace" ? "In den Workspace verschieben?" : "In Privat verschieben?"}
            </h2>

            <p className="text-sm text-muted-foreground">
                {target === "workspace"
                    ? `„${page.title}“ und alle Unterseiten werden für alle Mitglieder dieses Workspace sichtbar und bearbeitbar.`
                    : `„${page.title}“ und alle Unterseiten sieht danach nur noch du. Andere Mitglieder verlieren den Zugriff; Unterseiten, die sie angelegt haben, gehen an dich. Einzelne Freigaben bleiben bestehen.`}
            </p>

            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}

            <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                    Abbrechen
                </Button>
                <Button type="button" onClick={() => void move()} disabled={busy}>
                    {busy ? "Verschiebt …" : "Verschieben"}
                </Button>
            </div>
        </Dialog>
    );
}
