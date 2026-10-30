import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type EditorFrameProps = {
    /** Left part of the top bar: back button and path. */
    topBarStart: ReactNode;
    status?: ReactNode;
    /** Right part of the top bar: page menu. */
    topBarEnd?: ReactNode;
    /** Hints between top bar and content, e.g. sync problems. */
    notices?: ReactNode;
    /** Use the whole width instead of the narrow reading column. */
    fullWidth?: boolean;
    children: ReactNode;
};

/**
 * Layout of an open page: a slim top bar and a narrow, centered column
 * that scrolls with title and content; a cover spans the whole width
 * (`.nodi-page-column` in index.css). Kept out of the lazily loaded
 * editor chunk so that loading states use the same frame.
 */
export function EditorFrame({
    topBarStart,
    status,
    topBarEnd,
    notices,
    fullWidth = false,
    children,
}: EditorFrameProps) {
    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="nodi-page-top-bar box-content flex h-11 shrink-0 items-center gap-2 pt-[env(safe-area-inset-top)] pr-[max(0.75rem,env(safe-area-inset-right))] pl-3 text-sm">
                <div className="flex min-w-0 flex-1 items-center gap-1">{topBarStart}</div>
                {status && <div className="shrink-0 text-xs text-muted-foreground">{status}</div>}
                {topBarEnd}
            </div>
            {notices}
            <div className="nodi-page-scroll min-h-0 flex-1 overflow-y-auto pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)]">
                <div className={cn("nodi-page-column pt-(--page-top) pb-32", fullWidth && "nodi-page-column-full")}>
                    {children}
                </div>
            </div>
        </div>
    );
}
