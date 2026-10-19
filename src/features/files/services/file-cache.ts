import { completion, DatabaseConnection, promisify } from "@/lib/indexed-db";
import { pageIdOfFilePath } from "../file-reference";

const DATABASE_VERSION = 1;
const FILES = "files";

/** A database of its own, so the document database needs no upgrade. */
export function fileCacheDatabaseName(userId: string): string {
    return `nodi-${userId}-files`;
}

/**
 * Images the user has seen, by storage path, for offline reading
 * (decision of the user, CLAUDE.md §12 P15). Deleted on logout.
 */
export class FileCache {
    private readonly connection: DatabaseConnection;

    constructor(userId: string, factory: IDBFactory = indexedDB) {
        this.connection = new DatabaseConnection(factory, fileCacheDatabaseName(userId), DATABASE_VERSION, (database) =>
            database.createObjectStore(FILES),
        );
    }

    async get(path: string): Promise<Blob | null> {
        const database = await this.connection.open();
        const value: unknown = await promisify(database.transaction(FILES).objectStore(FILES).get(path));
        return value instanceof Blob ? value : null;
    }

    async put(path: string, file: Blob): Promise<void> {
        const database = await this.connection.open();
        const transaction = database.transaction(FILES, "readwrite");
        transaction.objectStore(FILES).put(file, path);
        await completion(transaction);
    }

    /** Removes the files of pages the user can no longer read (revoked shares). */
    async deleteFilesExcept(readablePageIds: ReadonlySet<string>): Promise<number> {
        const database = await this.connection.open();
        const transaction = database.transaction(FILES, "readwrite");
        const store = transaction.objectStore(FILES);
        const paths = await promisify(store.getAllKeys());
        let deleted = 0;
        for (const path of paths) {
            const pageId = typeof path === "string" ? pageIdOfFilePath(path) : null;
            if (pageId === null || !readablePageIds.has(pageId)) {
                store.delete(path);
                deleted += 1;
            }
        }
        await completion(transaction);
        return deleted;
    }

    close(): Promise<void> {
        return this.connection.close();
    }
}

const cachesByUser = new Map<string, FileCache>();

export function fileCacheFor(userId: string): FileCache {
    let cache = cachesByUser.get(userId);
    if (!cache) {
        cache = new FileCache(userId);
        cachesByUser.set(userId, cache);
    }
    return cache;
}

/** Closes the shared cache before the account's data is deleted. */
export async function closeFileCache(userId: string): Promise<void> {
    const cache = cachesByUser.get(userId);
    cachesByUser.delete(userId);
    await cache?.close();
}
