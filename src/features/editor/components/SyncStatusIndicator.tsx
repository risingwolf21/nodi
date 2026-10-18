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
    const { unsyncedPages, failure } = useSyncExternalStore(
        engine.subscribeOverview,
        engine.getOverview,
    );

    if (unsyncedPages === 0) {
        return offline ? (
            <span className="text-xs text-muted-foreground" role="status">
                Offline
            </span>
        ) : null;
    }

    const pages = unsyncedPages === 1 ? "1 Seite" : `${unsyncedPages} Seiten`;

    return (
        <span className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
            <span>
                {pages} nicht synchronisiert
                {failure && ` – ${failureHints[failure]}`}
            </span>
            {failure && (
                <button
                    type="button"
                    className="underline"
                    onClick={() => void engine.retryNow()}
                >
                    Erneut versuchen
                </button>
            )}
        </span>
    );
}
