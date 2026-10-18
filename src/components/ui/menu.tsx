import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type MenuProps = {
    open: boolean;
    onClose: () => void;
    /** Which edge of the trigger the panel lines up with. */
    align?: "start" | "end";
    /** "dialog" for a panel with inputs (e.g. picking or creating an option). */
    role?: "menu" | "dialog";
    label?: string;
    /**
     * Shown on top of the page next to the trigger instead of below it in
     * the layout: for triggers in scrolling containers (tables), which
     * would clip the panel. Follows the trigger when the page scrolls or
     * resizes (e.g. the on-screen keyboard opens).
     */
    detached?: boolean;
    className?: string;
    children: ReactNode;
};

const VIEWPORT_MARGIN = 8;
const TRIGGER_GAP = 4;

/** Places a detached panel below its trigger, or above when there is more room there. */
function placeNextTo(panel: HTMLElement, trigger: HTMLElement, align: "start" | "end") {
    const rect = trigger.getBoundingClientRect();
    const width = panel.offsetWidth;
    const height = panel.scrollHeight;
    const left = align === "end" ? rect.right - width : rect.left;
    const maxLeft = window.innerWidth - width - VIEWPORT_MARGIN;
    panel.style.left = `${Math.max(VIEWPORT_MARGIN, Math.min(left, maxLeft))}px`;

    const below = window.innerHeight - rect.bottom - TRIGGER_GAP - VIEWPORT_MARGIN;
    const above = rect.top - TRIGGER_GAP - VIEWPORT_MARGIN;
    if (height > below && above > below) {
        const shown = Math.min(height, above);
        panel.style.top = `${rect.top - TRIGGER_GAP - shown}px`;
        panel.style.maxHeight = `${above}px`;
    } else {
        panel.style.top = `${rect.bottom + TRIGGER_GAP}px`;
        panel.style.maxHeight = `${below}px`;
    }
}

/**
 * Dropdown panel for a trigger inside a `relative` wrapper. Closes on
 * Escape and on a click or tap outside, also on touch screens.
 */
export function Menu({
    open,
    onClose,
    align = "end",
    role = "menu",
    label,
    detached = false,
    className,
    children,
}: MenuProps) {
    const anchorRef = useRef<HTMLSpanElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const trigger = anchorRef.current?.parentElement;
        const panel = panelRef.current;
        if (!open || !detached || !trigger || !panel) return;
        const place = () => placeNextTo(panel, trigger, align);
        place();

        function placeOnScroll(event: Event) {
            // Scrolling inside the panel (a long list) does not move it.
            if (event.target instanceof Node && panel?.contains(event.target)) return;
            place();
        }

        window.addEventListener("scroll", placeOnScroll, true);
        window.addEventListener("resize", place);
        return () => {
            window.removeEventListener("scroll", placeOnScroll, true);
            window.removeEventListener("resize", place);
        };
    }, [open, detached, align]);

    useEffect(() => {
        if (!open) return;

        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === "Escape") onClose();
        }

        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [open, onClose]);

    if (!open) return null;

    const panel = (
        <>
            <div className="fixed inset-0 z-40" aria-hidden="true" onClick={onClose} />
            <div
                ref={panelRef}
                role={role}
                aria-label={label}
                className={cn(
                    "z-50 min-w-44 rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
                    detached
                        ? "fixed overflow-y-auto"
                        : cn("absolute top-full mt-1", align === "end" ? "right-0" : "left-0"),
                    className,
                )}
            >
                {children}
            </div>
        </>
    );

    if (!detached) return panel;
    return (
        <>
            <span ref={anchorRef} hidden />
            {createPortal(panel, document.body)}
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
