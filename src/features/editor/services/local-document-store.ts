import { compareVersions, NEVER_EDITED, parseLocalDocument } from "../document-sync";
import type { LocalDocument, RemoteDocument } from "../types";

const DATABASE_VERSION = 1;
const DOCUMENTS = "documents";

/** One database per account, so documents never mix between users. */
export function localDatabaseName(userId: string): string {
    return `nodi-${userId}`;
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function completion(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
    });
}

function openDatabase(factory: IDBFactory, name: string): Promise<IDBDatabase> {
    const request = factory.open(name, DATABASE_VERSION);

    request.onupgradeneeded = () => {
        request.result.createObjectStore(DOCUMENTS, { keyPath: "pageId" });
    };

    return promisify(request);
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
    private database: Promise<IDBDatabase> | null = null;
    private readonly userId: string;
    private readonly factory: IDBFactory;

    constructor(userId: string, factory: IDBFactory = indexedDB) {
        this.userId = userId;
        this.factory = factory;
    }

    private open(): Promise<IDBDatabase> {
        this.database ??= openDatabase(this.factory, localDatabaseName(this.userId));
        return this.database;
    }

    async get(pageId: string): Promise<LocalDocument | null> {
        const database = await this.open();
        const stored: unknown = await promisify(
            database.transaction(DOCUMENTS).objectStore(DOCUMENTS).get(pageId),
        );

        if (stored === undefined) return null;

        const record = parseLocalDocument(stored);
        if (!record) {
            console.warn("Lokales Dokument ist ungültig und wird ignoriert:", pageId);
        }
        return record;
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
