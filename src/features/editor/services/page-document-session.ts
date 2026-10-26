import { RemoteRequestError, type RequestFailureReason } from "@/lib/request-errors";
import type { DocumentContent, LocalDocument, RemoteDocumentApi } from "../types";
import type { DocumentChanges } from "./document-changes";
import type { LocalDocumentStore } from "./local-document-store";
import type { SyncEngine, SyncFailure } from "./sync-engine";

export const SAVE_DEBOUNCE_MS = 800;

export type SessionStatus =
    | { kind: "synced" }
    /** Edits are waiting for the debounce. */
    | { kind: "pending" }
    | { kind: "saving" }
    /** Stored locally, not yet on the server. */
    | { kind: "unsynced"; reason: Exclude<RequestFailureReason, "permanent"> }
    /** Nothing to sync, but the server is not reachable. */
    | { kind: "offline" }
    /** Saving failed for good; the edit stays on this device. */
    | { kind: "error"; message: string }
    /** A newer version could not be loaded; nothing local is at risk. */
    | { kind: "loadFailed"; message: string };

export type PageDocumentSessionOptions = {
    pageId: string;
    store: LocalDocumentStore;
    remote: RemoteDocumentApi;
    changes: DocumentChanges;
    sync: Pick<SyncEngine, "requestSync" | "retryNow" | "onFailure" | "addFlusher">;
    onStatus: (status: SessionStatus) => void;
    /** Stored content replaced what the editor shows (other device or tab). */
    onRemoteContent: (content: DocumentContent, supersededLocalEdit: boolean) => void;
    onPermission: (canEdit: boolean) => void;
    now?: () => Date;
    createMutationId?: () => string;
};

export type InitialDocument = {
    document: LocalDocument;
    /** Loaded from the server just now, no need to compare again. */
    freshFromServer: boolean;
};

/**
 * Opens a page from the local store, so it works offline. Only a page that
 * has never been opened on this device is loaded from the server; that
 * throws a RemoteRequestError when the server cannot be reached.
 */
export async function loadInitialDocument(
    pageId: string,
    store: LocalDocumentStore,
    remote: RemoteDocumentApi,
): Promise<InitialDocument> {
    const local = await store.get(pageId);
    if (local) return { document: local, freshFromServer: false };

    const fetched = await remote.fetch(pageId);
    const { record } = await store.applyRemote(pageId, fetched.document, fetched.canEdit);
    return { document: record, freshFromServer: true };
}

/**
 * Editing flow for one open page: every edit is written to the local
 * store first; the sync engine sends it. The session follows the stored
 * state, so results from the engine and from other tabs arrive the same
 * way. Operations on the local store run one after another; network
 * requests stay outside that queue, so a hanging connection never delays
 * storing an edit.
 */
export class PageDocumentSession {
    private readonly options: PageDocumentSessionOptions;
    private current: LocalDocument | null = null;
    private pendingContent: DocumentContent | null = null;
    private pendingEditedAt: string | null = null;
    /** Edits taken from the editor but not yet in the local store. */
    private localWritesInFlight = 0;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private queue: Promise<void> = Promise.resolve();
    private unsubscribers: (() => void)[] = [];

    constructor(options: PageDocumentSessionOptions) {
        this.options = options;
    }

    private now(): Date {
        return this.options.now?.() ?? new Date();
    }

    private createMutationId(): string {
        return this.options.createMutationId?.() ?? crypto.randomUUID();
    }

    /**
     * Starts with the document the editor shows. An unsynced copy is handed
     * to the sync engine; a synced copy that did not come straight from the
     * server is compared with the server once.
     */
    start(initial: LocalDocument, { freshFromServer }: { freshFromServer: boolean }): Promise<void> {
        const { changes, sync, pageId } = this.options;
        this.current = initial;
        this.options.onStatus(initial.synced ? { kind: "synced" } : { kind: "saving" });

        this.unsubscribers.push(
            changes.subscribe((changedPageId) => {
                if (changedPageId === pageId) void this.enqueue(() => this.adoptStoredVersion());
            }),
            sync.onFailure((failure) => this.showFailure(failure)),
            sync.addFlusher(() => this.flush()),
        );

        if (!initial.synced) return sync.requestSync();
        if (freshFromServer) return this.queue;
        return this.refresh();
    }

    recordEdit(content: DocumentContent): void {
        this.pendingContent = content;
        // The edit time is when the user typed, not when the debounce fires.
        this.pendingEditedAt = this.now().toISOString();
        this.options.onStatus({ kind: "pending" });

        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => {
            this.timer = null;
            void this.flush();
        }, SAVE_DEBOUNCE_MS);
    }

    /** Writes pending edits now, e.g. when the page is hidden or left. */
    flush(): Promise<void> {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        const content = this.pendingContent;
        const editedAt = this.pendingEditedAt;
        if (!content || !editedAt || !this.current) return this.queue;

        this.pendingContent = null;
        this.pendingEditedAt = null;
        this.localWritesInFlight += 1;

        const record: LocalDocument = {
            ...this.current,
            // Snapshot: later editor changes must not alter this write.
            content: structuredClone(content),
            editedAt,
            mutationId: this.createMutationId(),
            synced: false,
        };

        return this.enqueue(async () => {
            this.options.onStatus({ kind: "saving" });
            try {
                await this.options.store.putLocalEdit(record);
            } finally {
                this.localWritesInFlight -= 1;
            }
            this.current = record;
            this.options.changes.announce(record.pageId);
            // Not awaited: the edit is stored; sending it is the engine's job.
            this.options.sync.requestSync().catch((error: unknown) => {
                console.error("Synchronisierung konnte nicht gestartet werden:", error);
            });
        });
    }

    /**
     * Asks the server for a newer version, e.g. when back online. Unsynced
     * edits are the engine's job; only a synced copy is refreshed.
     */
    async refresh(): Promise<void> {
        const { pageId, remote, store, changes } = this.options;
        if (!this.current?.synced) return;

        let fetched;
        try {
            fetched = await remote.fetch(pageId);
        } catch (error) {
            this.reportFetchFailure(error);
            return;
        }

        // The store only replaces a synced copy that is older (compare-and-set).
        return this.enqueue(async () => {
            this.options.onPermission(fetched.canEdit);
            const { replaced } = await store.applyRemote(pageId, fetched.document, fetched.canEdit);
            if (replaced) changes.announce(pageId);
            if (!this.hasUnstoredEdits() && this.current?.synced) this.options.onStatus({ kind: "synced" });
        });
    }

    /** True if this mutation is the one shown (e.g. a live update about our own save). */
    holdsMutation(mutationId: string): boolean {
        return this.current?.mutationId === mutationId;
    }

    /** The user asks again after an error. */
    retry(): Promise<void> {
        return Promise.all([this.options.sync.retryNow(), this.refresh()]).then(() => undefined);
    }

    /** Pending edits are stored and handed to the sync engine. */
    dispose(): Promise<void> {
        const flushed = this.flush();
        for (const unsubscribe of this.unsubscribers) unsubscribe();
        this.unsubscribers = [];
        return flushed;
    }

    /** Typing wins over stored or remote versions until it is stored itself. */
    private hasUnstoredEdits(): boolean {
        return this.pendingContent !== null || this.localWritesInFlight > 0;
    }

    private enqueue(operation: () => Promise<void>): Promise<void> {
        const run = this.queue.then(operation).catch((error: unknown) => {
            console.error("Synchronisierung fehlgeschlagen:", error);
            this.options.onStatus({
                kind: "error",
                message: error instanceof Error ? error.message : "Unbekannter Fehler",
            });
        });
        this.queue = run;
        return run;
    }

    /** Follows the stored state after the engine, a refresh or another tab changed it. */
    private async adoptStoredVersion(): Promise<void> {
        const current = this.current;
        const stored = await this.options.store.get(this.options.pageId);
        if (!current || !stored) return;

        if (stored.canEdit !== null) this.options.onPermission(stored.canEdit);

        if (stored.mutationId === current.mutationId && stored.editedAt === current.editedAt) {
            this.current = stored;
            if (stored.synced && !this.hasUnstoredEdits()) this.options.onStatus({ kind: "synced" });
            return;
        }

        // Typing wins: the pending edit is newer and will replace it.
        if (this.hasUnstoredEdits()) return;

        // Option A (CLAUDE.md §2): our unsynced edit lost against a newer version.
        const supersededLocalEdit = !current.synced && stored.synced;
        this.current = stored;
        this.options.onRemoteContent(stored.content, supersededLocalEdit);
        this.options.onStatus(stored.synced ? { kind: "synced" } : { kind: "saving" });
    }

    private showFailure(failure: SyncFailure): void {
        const current = this.current;
        if (
            failure.pageId !== this.options.pageId ||
            !current ||
            current.synced ||
            current.mutationId !== failure.mutationId ||
            this.hasUnstoredEdits()
        ) {
            return;
        }

        this.options.onStatus(
            failure.reason === "permanent"
                ? { kind: "error", message: failure.message }
                : { kind: "unsynced", reason: failure.reason },
        );
    }

    private reportFetchFailure(error: unknown): void {
        if (!(error instanceof RemoteRequestError) || error.reason === "permanent") {
            console.error("Dokument konnte nicht vom Server geladen werden:", error);
            this.options.onStatus({
                kind: "loadFailed",
                message: error instanceof Error ? error.message : "Unbekannter Fehler",
            });
            return;
        }

        this.options.onStatus({ kind: "offline" });
    }
}
