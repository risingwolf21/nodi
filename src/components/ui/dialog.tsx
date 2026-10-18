import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type DialogProps = {
    /** "alertdialog" for questions before something that cannot be undone. */
    role?: "dialog" | "alertdialog";
    labelledBy: string;
    describedBy?: string;
    /** Escape and a click outside ask to close, unless busy. */
    onClose: () => void;
    busy?: boolean;
    className?: string;
    children: ReactNode;
};

/**
 * Modal dialog, open while mounted. The native `<dialog>` keeps the focus
 * inside and makes the page behind it inert; the focus goes back to where
 * it was when the dialog closes.
 */
export function Dialog({ role, labelledBy, describedBy, onClose, busy = false, className, children }: DialogProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    // The handlers below read the latest values without reopening the dialog.
    const latest = useRef({ onClose, busy });

    useEffect(() => {
        latest.current = { onClose, busy };
    });

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const previouslyFocused = document.activeElement;

        dialog.showModal();

        // Escape: closing is up to the owner of the dialog, not the browser.
        const askToClose = (event: Event) => {
            event.preventDefault();
            if (!latest.current.busy) latest.current.onClose();
        };
        dialog.addEventListener("cancel", askToClose);

        return () => {
            dialog.removeEventListener("cancel", askToClose);
            dialog.close();
            if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
                previouslyFocused.focus();
            }
        };
    }, []);

    return (
        <dialog
            ref={dialogRef}
            role={role}
            aria-labelledby={labelledBy}
            aria-describedby={describedBy}
            // A click on the backdrop lands on the dialog element itself.
            onMouseDown={(event) => {
                if (event.target === event.currentTarget && !busy) onClose();
            }}
            className={cn(
                "m-auto w-[calc(100%-2rem)] max-w-sm rounded-lg border bg-background p-0 text-foreground shadow-lg backdrop:bg-black/50",
                className,
            )}
        >
            {/* Clicks inside land here, so only the backdrop closes. */}
            <div className="space-y-4 p-5">{children}</div>
        </dialog>
    );
}
