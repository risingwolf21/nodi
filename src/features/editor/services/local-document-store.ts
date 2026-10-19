import { completion, DatabaseConnection, promisify } from "@/lib/indexed-db";
import { compareVersions, NEVER_EDITED, parseLocalDocument } from "../document-sync";
import type { LocalDocument, RemoteDocument } from "../types";

const DATABASE_VERSION = 1;
const DOCUMENTS = "documents";

/** One database per account, so documents never mix between users. */
export function localDatabaseName(userId: string): string {
    return `nodi-${userId}`;
}

const storesByUser = new Map<string, LocalDocumentStore>();

/** Shared per account, so a tab keeps one database connection per user. */
export function localDocumentStoreFor(userId: string): LocalDocumentStore {
    let store = storesByUser.get(userId);
    if (!store) {
        store = new LocalDocumentStore(userId);
        storesByUser.set(userId, store);
    }
    return store;
}

/** Closes the shared store before the account's data is deleted. */
export async function closeLocalDocumentStore(userId: string): Promise<void> {
    const store = storesByUser.get(userId);
    storesByUser.delete(userId);
    await store?.close();
}

export type ApplyRemoteResult = {
    record: LocalDocument;
    /** The stored content changed to the remote content. */
    replaced: boolean;
};

/**
 * Last known document state per page, kept across reloads and offline.
 * Every read-modify-write runs in a single IndexedDB transaction, so
 * concurrent writes from the editor and from sync cannot overwrite each
 * other unnoticed.
 */
export class LocalDocumentStore {
    private readonly connection: DatabaseConnection;

    constructor(userId: string, factory: IDBFactory = indexedDB) {
        this.connection = new DatabaseConnection(factory, localDatabaseName(userId), DATABASE_VERSION, (database) =>
            database.createObjectStore(DOCUMENTS, { keyPath: "pageId" }),
        );
    }

    private open(): Promise<IDBDatabase> {
        return this.connection.open();
    }

    close(): Promise<void> {
        return this.connection.close();
    }

    async get(pageId: string): Promise<LocalDocument | null> {
        const database = await this.open();
        const stored: unknown = await promisify(database.transaction(DOCUMENTS).objectStore(DOCUMENTS).get(pageId));

        if (stored === undefined) return null;

        const record = parseLocalDocument(stored);
        if (!record) {
            console.warn("Lokales Dokument ist ungültig und wird ignoriert:", pageId);
        }
        return record;
    }

    /** Every document with a local edit the server has not confirmed yet. */
    async listUnsynced(): Promise<LocalDocument[]> {
        const database = await this.open();
        const stored: unknown[] = await promisify(database.transaction(DOCUMENTS).objectStore(DOCUMENTS).getAll());

        return stored
            .map(parseLocalDocument)
            .filter((record): record is LocalDocument => record !== null && !record.synced);
    }

    /** Stores a local edit. It is unsynced until the server confirms it. */
    async putLocalEdit(record: LocalDocument): Promise<void> {
        const database = await this.open();
        const transaction = database.transaction(DOCUMENTS, "readwrite");
        transaction.objectStore(DOCUMENTS).put(record);
        await completion(transaction);
    }

    /**
     * Marks the stored version as confirmed, but only if it is still the
     * version that was sent. Returns false if a newer local edit exists.
     */
    async markSynced(pageId: string, mutationId: string): Promise<boolean> {
        return this.update(pageId, (current) => {
            if (!current || current.mutationId !== mutationId) return null;
            return { ...current, synced: true };
        }).then((result) => result !== null);
    }

    /**
     * Takes over the server state unless that would discard local work:
     * an unsynced local edit is kept, except the one the server rejected
     * (`rejectedMutationId`), and a newer synced version is kept as well.
     * The edit permission is always updated.
     */
    async applyRemote(
        pageId: string,
        remote: RemoteDocument | null,
        canEdit: boolean,
        rejectedMutationId?: string,
    ): Promise<ApplyRemoteResult> {
        const remoteRecord: LocalDocument = {
            pageId,
            content: remote?.content ?? [],
            editedAt: remote?.editedAt ?? NEVER_EDITED,
            mutationId: remote?.mutationId ?? null,
            synced: true,
            canEdit,
        };

        let replaced = false;

        const record = await this.update(pageId, (current) => {
            const keepCurrent =
                current !== null &&
                (current.synced
                    ? compareVersions(current, remoteRecord) >= 0
                    : current.mutationId !== rejectedMutationId);

            if (current && keepCurrent) return { ...current, canEdit };

            replaced = true;
            return remoteRecord;
        });

        // update() only returns null when the callback does.
        return { record: record ?? remoteRecord, replaced };
    }

    /**
     * Deletes the copies of pages the user can no longer read (access
     * revoked, page deleted). Unsynced edits are kept: they must not
     * disappear silently; the sync engine reports them as failed.
     * Checks and deletes in one transaction, so an edit stored meanwhile
     * is never lost. Returns the ids of the deleted copies.
     */
    async deleteSyncedExcept(readablePageIds: ReadonlySet<string>): Promise<string[]> {
        const database = await this.open();
        const transaction = database.transaction(DOCUMENTS, "readwrite");
        const store = transaction.objectStore(DOCUMENTS);

        const stored: unknown[] = await promisify(store.getAll());
        const deleted: string[] = [];
        for (const value of stored) {
            const record = parseLocalDocument(value);
            if (!record || !record.synced || readablePageIds.has(record.pageId)) continue;
            store.delete(record.pageId);
            deleted.push(record.pageId);
        }

        await completion(transaction);
        return deleted;
    }

    private async update(
        pageId: string,
        change: (current: LocalDocument | null) => LocalDocument | null,
    ): Promise<LocalDocument | null> {
        const database = await this.open();
        const transaction = database.transaction(DOCUMENTS, "readwrite");
        const store = transaction.objectStore(DOCUMENTS);

        const stored: unknown = await promisify(store.get(pageId));
        const next = change(stored === undefined ? null : parseLocalDocument(stored));
        if (next) store.put(next);

        await completion(transaction);
        return next;
    }
}
