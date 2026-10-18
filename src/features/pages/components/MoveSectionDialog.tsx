import { useState } from "react";
import { Button } from "@/components/ui/button";
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
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget && !busy) onClose();
            }}
        >
            <section
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="move-section-title"
                className="w-full max-w-sm space-y-4 rounded-lg border bg-background p-5 shadow-lg"
            >
                <h2 id="move-section-title" className="text-lg font-semibold">
                    {target === "workspace" ? "In den Workspace verschieben?" : "In Privat verschieben?"}
                </h2>

                <p className="text-sm text-muted-foreground">
                    {target === "workspace"
                        ? `„${page.title}“ und alle Unterseiten werden für alle Mitglieder dieses Workspace sichtbar und bearbeitbar.`
                        : `„${page.title}“ und alle Unterseiten sieht danach nur noch du. Andere Mitglieder verlieren den Zugriff. Ihre geteilten Unterseiten gehen an dich, ihre Freigaben und öffentlichen Links darauf enden; ihre privaten Unterseiten bleiben bei ihnen. Deine eigenen Freigaben bleiben bestehen.`}
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
            </section>
        </div>
    );
}
