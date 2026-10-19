import { RemoteRequestError, type RequestFailureReason } from "@/lib/request-errors";
import type { LocalDocument, RemoteDocumentApi } from "../types";
import type { DocumentChanges } from "./document-changes";
import type { LocalDocumentStore } from "./local-document-store";

export const SYNC_RETRY_BASE_MS = 2_000;
export const SYNC_RETRY_MAX_MS = 5 * 60_000;
/** Timed retries stop after this many failed passes in a row. */
export const SYNC_MAX_ATTEMPTS = 10;

export type SyncFailure = {
    pageId: string;
    mutationId: string;
    reason: RequestFailureReason;
    message: string;
};

export type SyncOverview = {
    /** Pages with local edits the server has not confirmed. */
    unsyncedPages: number;
    /** Why the last pass could not send everything; null if it could. */
    failure: RequestFailureReason | null;
};

type Lock = (name: string, task: () => Promise<void>) => Promise<void>;

export type SyncEngineOptions = {
    userId: string;
    store: LocalDocumentStore;
    remote: RemoteDocumentApi;
    changes: DocumentChanges;
    /** Serializes passes across tabs; defaults to the Web Locks API. */
    lock?: Lock;
};

function webLock(name: string, task: () => Promise<void>): Promise<void> {
    // Without Web Locks, tabs may send the same mutation twice; the server
    // treats a replay as already applied.
    if (!("locks" in navigator)) return task();
    return navigator.locks.request(name, task);
}

function describeError(error: unknown): { reason: RequestFailureReason; message: string } {
    if (error instanceof RemoteRequestError) {
        return { reason: error.reason, message: error.message };
    }
    console.error("Synchronisierung fehlgeschlagen:", error);
    // Unknown errors (e.g. IndexedDB) are retried a limited number of times.
    return {
        reason: "temporary",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
    };
}

/**
 * Sends every unsynced local edit of one account, also for pages that are
 * not open and after a restart. Temporary failures are retried with
 * exponential backoff; permanent ones are kept locally and not retried
 * until the user asks for it.
 */
export class SyncEngine {
    private readonly options: SyncEngineOptions;
    private running: Promise<void> | null = null;
    private rerunRequested = false;
    private failedPasses = 0;
    private retryTimer: ReturnType<typeof setTimeout> | null = null;
    /** Permanently failed mutation ids with their error message. */
    private readonly rejected = new Map<string, string>();
    private readonly failureListeners = new Set<(failure: SyncFailure) => void>();
    private stopListening: (() => void) | null = null;
    /** After stop() (logout), no timed retries; explicit requests still run. */
    private stopped = false;
    private overview: SyncOverview = { unsyncedPages: 0, failure: null };
    private readonly overviewListeners = new Set<() => void>();
    /** Open editors, so a logout can store their pending edits first. */
    private readonly flushers = new Set<() => Promise<void>>();

    constructor(options: SyncEngineOptions) {
        this.options = options;
    }

    /** Syncs now and whenever the connection or the app comes back. */
    start(): void {
        if (this.stopListening) return;
        this.stopped = false;

        const syncAgain = () => {
            this.failedPasses = 0;
            void this.requestSync();
        };
        const syncWhenVisible = () => {
            if (document.visibilityState === "visible") syncAgain();
        };

        // `online` is only a hint; the request shows whether Supabase answers.
        window.addEventListener("online", syncAgain);
        document.addEventListener("visibilitychange", syncWhenVisible);
        // Edits and syncs, also in other tabs, change the number of pages.
        const stopCounting = this.options.changes.subscribe(() => {
            void this.updateOverview(this.overview.failure);
        });
        this.stopListening = () => {
            window.removeEventListener("online", syncAgain);
            document.removeEventListener("visibilitychange", syncWhenVisible);
            stopCounting();
        };

        void this.requestSync();
    }

    stop(): void {
        this.stopped = true;
        this.stopListening?.();
        this.stopListening = null;
        this.clearRetryTimer();
    }

    onFailure(listener: (failure: SyncFailure) => void): () => void {
        this.failureListeners.add(listener);
        return () => this.failureListeners.delete(listener);
    }

    /** For useSyncExternalStore: same object until something changed. */
    readonly getOverview = (): SyncOverview => this.overview;

    readonly subscribeOverview = (listener: () => void): (() => void) => {
        this.overviewListeners.add(listener);
        return () => this.overviewListeners.delete(listener);
    };

    addFlusher(flush: () => Promise<void>): () => void {
        this.flushers.add(flush);
        return () => this.flushers.delete(flush);
    }

    /**
     * Before a logout: stores the pending edits of open editors, sends
     * everything once more and returns how many pages are still unsynced.
     */
    async syncAll(): Promise<number> {
        await Promise.all([...this.flushers].map((flush) => flush()));
        await this.retryNow();
        return (await this.options.store.listUnsynced()).length;
    }

    /** Runs a pass; a request during a pass runs one more pass after it. */
    requestSync(): Promise<void> {
        if (this.running) {
            this.rerunRequested = true;
            return this.running;
        }

        this.clearRetryTimer();
        this.running = this.drain().finally(() => {
            this.running = null;
        });
        return this.running;
    }

    /** The user asks again: permanent failures get one more chance. */
    retryNow(): Promise<void> {
        this.rejected.clear();
        this.failedPasses = 0;
        return this.requestSync();
    }

    private async drain(): Promise<void> {
        let failure: RequestFailureReason | null;
        do {
            this.rerunRequested = false;
            failure = await this.runPass();
        } while (this.rerunRequested);

        await this.updateOverview(failure);

        // Permanent failures are not retried on a timer.
        if (failure === null || failure === "permanent") {
            this.failedPasses = 0;
        } else {
            this.failedPasses += 1;
            this.scheduleRetry();
        }
    }

    private runPass(): Promise<RequestFailureReason | null> {
        let failure: RequestFailureReason | null = null;
        const lock = this.options.lock ?? webLock;

        return lock(`nodi-sync-${this.options.userId}`, async () => {
            failure = await this.sendPending();
        }).then(
            () => failure,
            (error: unknown) => describeError(error).reason,
        );
    }

    /**
     * Returns the reason a temporary failure stopped the pass, "permanent"
     * if some edits were rejected for good, or null if all were sent.
     */
    private async sendPending(): Promise<RequestFailureReason | null> {
        const pending = await this.options.store.listUnsynced();
        let rejectedSome = false;

        for (const [index, record] of pending.entries()) {
            const { mutationId } = record;
            if (!mutationId) continue;

            const rejectedMessage = this.rejected.get(mutationId);
            if (rejectedMessage !== undefined) {
                rejectedSome = true;
                this.reportFailure(record, mutationId, "permanent", rejectedMessage);
                continue;
            }

            let failure: { reason: RequestFailureReason; message: string } | null;
            try {
                failure = await this.send(record, mutationId);
            } catch (error) {
                failure = describeError(error);
            }
            if (!failure) continue;

            if (failure.reason === "permanent") {
                rejectedSome = true;
                this.rejected.set(mutationId, failure.message);
                this.reportFailure(record, mutationId, failure.reason, failure.message);
                continue;
            }

            // The server is out of reach for all of them, not just this one.
            for (const waiting of pending.slice(index)) {
                if (waiting.mutationId) {
                    this.reportFailure(waiting, waiting.mutationId, failure.reason, failure.message);
                }
            }
            return failure.reason;
        }

        return rejectedSome ? "permanent" : null;
    }

    private async send(
        record: LocalDocument,
        mutationId: string,
    ): Promise<{ reason: RequestFailureReason; message: string } | null> {
        const { store, remote, changes } = this.options;
        const outcome = await remote.save(record.pageId, record.content, {
            editedAt: record.editedAt,
            mutationId,
        });

        if (outcome.kind === "failed") return outcome;

        if (outcome.kind === "saved") {
            if (await store.markSynced(record.pageId, mutationId)) {
                changes.announce(record.pageId);
            }
            return null;
        }

        // Superseded (Option A): take over the newer server version.
        const fetched = await remote.fetch(record.pageId);
        await store.applyRemote(record.pageId, fetched.document, fetched.canEdit, mutationId);
        changes.announce(record.pageId);
        return null;
    }

    private reportFailure(
        record: LocalDocument,
        mutationId: string,
        reason: RequestFailureReason,
        message: string,
    ): void {
        const failure = { pageId: record.pageId, mutationId, reason, message };
        for (const listener of this.failureListeners) listener(failure);
    }

    private async updateOverview(failure: RequestFailureReason | null): Promise<void> {
        let unsyncedPages: number;
        try {
            unsyncedPages = (await this.options.store.listUnsynced()).length;
        } catch (error) {
            console.warn("Ungesyncte Seiten konnten nicht gezählt werden:", error);
            return;
        }

        const next = { unsyncedPages, failure: unsyncedPages > 0 ? failure : null };
        if (next.unsyncedPages === this.overview.unsyncedPages && next.failure === this.overview.failure) {
            return;
        }

        this.overview = next;
        for (const listener of this.overviewListeners) listener();
    }

    private scheduleRetry(): void {
        if (this.stopped || this.failedPasses >= SYNC_MAX_ATTEMPTS) return;

        const delay = Math.min(SYNC_RETRY_BASE_MS * 2 ** (this.failedPasses - 1), SYNC_RETRY_MAX_MS);
        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            void this.requestSync();
        }, delay);
    }

    private clearRetryTimer(): void {
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
    }
}
