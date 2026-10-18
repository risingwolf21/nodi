import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type MenuProps = {
    open: boolean;
    onClose: () => void;
    /** Which edge of the trigger the panel lines up with. */
    align?: "start" | "end";
    className?: string;
    children: ReactNode;
};

/**
 * Dropdown panel for a trigger inside a `relative` wrapper. Closes on
 * Escape and on a click or tap outside, also on touch screens.
 */
export function Menu({ open, onClose, align = "end", className, children }: MenuProps) {
    useEffect(() => {
        if (!open) return;

        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === "Escape") onClose();
        }

        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <>
            <div className="fixed inset-0 z-40" aria-hidden="true" onClick={onClose} />
            <div
                role="menu"
                className={cn(
                    "absolute top-full z-50 mt-1 min-w-44 rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
                    align === "end" ? "right-0" : "left-0",
                    className,
                )}
            >
                {children}
            </div>
        </>
    );
}

type MenuItemProps = {
    onSelect: () => void;
    destructive?: boolean;
    disabled?: boolean;
    children: ReactNode;
};

export function MenuItem({ onSelect, destructive = false, disabled = false, children }: MenuItemProps) {
    return (
        <button
            type="button"
            role="menuitem"
            disabled={disabled}
            onClick={onSelect}
            className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent disabled:pointer-events-none disabled:opacity-50 pointer-coarse:py-2.5",
                destructive && "text-destructive",
            )}
        >
            {children}
        </button>
    );
}
