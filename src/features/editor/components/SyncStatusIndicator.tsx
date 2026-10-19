import { useSyncExternalStore } from "react";
import type { RequestFailureReason } from "@/lib/request-errors";
import type { SyncEngine } from "../services/sync-engine";

type SyncStatusIndicatorProps = {
    engine: SyncEngine;
    /** No server connection known from elsewhere (auth, page tree). */
    offline: boolean;
};

const failureHints: Record<RequestFailureReason, string> = {
    offline: "offline",
    temporary: "Server nicht erreichbar",
    auth: "bitte neu anmelden",
    permanent: "Fehler beim Speichern",
};

/** Account-wide sync state, also for pages that are not open. */
export function SyncStatusIndicator({ engine, offline }: SyncStatusIndicatorProps) {
    const { unsyncedPages, failure } = useSyncExternalStore(engine.subscribeOverview, engine.getOverview);

    if (unsyncedPages === 0) {
        return offline ? (
            <span className="text-xs text-muted-foreground" role="status">
                Offline
            </span>
        ) : null;
    }

    const pages = unsyncedPages === 1 ? "1 Seite" : `${unsyncedPages} Seiten`;

    // Small screens: count only. Retries also run when the app is visible
    // again or back online, and the editor offers its own retry button.
    return (
        <span className="flex min-w-0 items-center gap-2 text-xs leading-tight text-muted-foreground">
            <span role="status" className="text-right">
                {pages} nicht synchronisiert
                {failure && <span className="hidden sm:inline"> – {failureHints[failure]}</span>}
            </span>
            {failure && (
                <button
                    type="button"
                    className="hidden shrink-0 underline sm:inline"
                    onClick={() => void engine.retryNow()}
                >
                    Erneut versuchen
                </button>
            )}
        </span>
    );
}
