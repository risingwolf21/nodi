import { RemoteRequestError } from "../document-sync";
import type {
    DocumentContent,
    LocalDocument,
    RemoteDocumentApi,
    RequestFailureReason,
} from "../types";
import type { LocalDocumentStore } from "./local-document-store";

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
    | { kind: "error"; message: string };

export type PageDocumentSessionOptions = {
    pageId: string;
    store: LocalDocumentStore;
    remote: RemoteDocumentApi;
    onStatus: (status: SessionStatus) => void;
    /** Server content replaced the local content (other device, Option A). */
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
 * Save and sync flow for one open page: every edit is written to the local
 * store first, then sent to the server. Operations run one after another,
 * so an older write can never overtake a newer one on this device.
 */
export class PageDocumentSession {
    private readonly options: PageDocumentSessionOptions;
    private current: LocalDocument | null = null;
    private pendingContent: DocumentContent | null = null;
    private pendingEditedAt: string | null = null;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private queue: Promise<void> = Promise.resolve();

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
     * Starts with the document the editor shows. Unless it came straight
     * from the server, its state is compared with the server once.
     */
    start(initial: LocalDocument, { freshFromServer }: { freshFromServer: boolean }): Promise<void> {
        this.current = initial;
        // An unsynced copy is sent right away by reconcile().
        this.options.onStatus(initial.synced ? { kind: "synced" } : { kind: "saving" });

        if (freshFromServer) return this.queue;
        return this.enqueue(() => this.reconcile());
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
            await this.options.store.putLocalEdit(record);
            this.current = record;
            await this.push(record);
        });
    }

    /** Retry after an error or when the user asks for it. */
    retry(): Promise<void> {
        return this.enqueue(() => this.reconcile());
    }

    dispose(): Promise<void> {
        return this.flush();
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

    /** Sends an unsynced local version, or takes over a newer server version. */
    private async reconcile(): Promise<void> {
        const current = this.current;
        if (!current) return;

        if (!current.synced) {
            await this.push(current);
            return;
        }

        let remote;
        try {
            remote = await this.options.remote.fetch(current.pageId);
        } catch (error) {
            this.reportFetchFailure(error, false);
            return;
        }

        this.options.onPermission(remote.canEdit);
        const { record, replaced } = await this.options.store.applyRemote(
            current.pageId,
            remote.document,
            remote.canEdit,
        );

        // Typing during the fetch wins: the pending edit is newer anyway.
        if (this.pendingContent || this.current !== current) return;

        this.current = record;
        if (replaced) this.options.onRemoteContent(record.content, false);
        this.options.onStatus({ kind: "synced" });
    }

    private async push(record: LocalDocument): Promise<void> {
        if (!record.mutationId) return;

        this.options.onStatus({ kind: "saving" });
        const outcome = await this.options.remote.save(record.pageId, record.content, {
            editedAt: record.editedAt,
            mutationId: record.mutationId,
        });

        if (outcome.kind === "saved") {
            const stillCurrent = await this.options.store.markSynced(record.pageId, record.mutationId);
            if (stillCurrent && this.current?.mutationId === record.mutationId) {
                this.current = { ...record, synced: true };
                if (!this.pendingContent) this.options.onStatus({ kind: "synced" });
            }
            return;
        }

        if (outcome.kind === "failed") {
            this.options.onStatus(
                outcome.reason === "permanent"
                    ? { kind: "error", message: outcome.message }
                    : { kind: "unsynced", reason: outcome.reason },
            );
            return;
        }

        await this.takeOverSupersedingVersion(record.mutationId);
    }

    /** Option A (CLAUDE.md §2): load the newer version and say so. */
    private async takeOverSupersedingVersion(rejectedMutationId: string): Promise<void> {
        const pageId = this.current?.pageId;
        if (!pageId) return;

        let remote;
        try {
            remote = await this.options.remote.fetch(pageId);
        } catch (error) {
            this.reportFetchFailure(error, true);
            return;
        }

        this.options.onPermission(remote.canEdit);
        const { record, replaced } = await this.options.store.applyRemote(
            pageId,
            remote.document,
            remote.canEdit,
            rejectedMutationId,
        );

        // A newer local edit exists; it will be sent next and decide itself.
        if (!replaced || this.pendingContent || this.current?.mutationId !== rejectedMutationId) {
            return;
        }

        this.current = record;
        this.options.onRemoteContent(record.content, true);
        this.options.onStatus({ kind: "synced" });
    }

    private reportFetchFailure(error: unknown, hasUnsyncedEdit: boolean): void {
        if (!(error instanceof RemoteRequestError) || error.reason === "permanent") {
            console.error("Dokument konnte nicht vom Server geladen werden:", error);
            this.options.onStatus({
                kind: "error",
                message: error instanceof Error ? error.message : "Unbekannter Fehler",
            });
            return;
        }

        this.options.onStatus(
            hasUnsyncedEdit ? { kind: "unsynced", reason: error.reason } : { kind: "offline" },
        );
    }
}
