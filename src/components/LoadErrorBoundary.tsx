import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type LoadErrorBoundaryProps = {
    /** Shown instead of the children; keep navigation in it usable. */
    fallback: ReactNode;
    children: ReactNode;
};

/**
 * Catches errors while rendering a lazily loaded part, e.g. a chunk that
 * could not be downloaded (no network before the service worker cached
 * it). Without it React unmounts the whole app. Key it by what it shows
 * (e.g. the page id), so another page gets a new attempt.
 */
export class LoadErrorBoundary extends Component<LoadErrorBoundaryProps, { failed: boolean }> {
    state = { failed: false };

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch(error: unknown, info: ErrorInfo) {
        console.error("Ansicht konnte nicht geladen werden:", error, info.componentStack);
    }

    render() {
        return this.state.failed ? this.props.fallback : this.props.children;
    }
}

/**
 * A rejected lazy import stays rejected until the page reloads, so
 * reloading is the retry. Edits are already stored locally (CLAUDE.md §4).
 */
export function LoadErrorNotice({ message }: { message: string }) {
    return (
        <div className="space-y-3 px-[var(--page-gutter)]" role="alert">
            <p className="text-sm text-destructive">{message}</p>
            <Button type="button" variant="outline" onClick={() => location.reload()}>
                Neu laden
            </Button>
        </div>
    );
}
