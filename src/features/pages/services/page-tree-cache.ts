import { completion, DatabaseConnection, promisify } from "@/lib/indexed-db";
import type { StoredPage, Workspace } from "../types";

const DATABASE_VERSION = 1;
const SNAPSHOTS = "snapshots";
const WORKSPACES_KEY = "workspaces";

/** Separate from the document database, so that one needs no upgrade. */
export function pageTreeDatabaseName(userId: string): string {
    return `nodi-${userId}-tree`;
}

const pagesKey = (workspaceId: string) => `pages:${workspaceId}`;
const databaseKey = (databaseId: string) => `database:${databaseId}`;
const databaseBlockKey = (pageId: string, blockId: string) => `database-block:${pageId}:${blockId}`;
const SHARED_PAGES_KEY = "shared-pages";

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

/** Also used for server answers; null means the data is not valid. */
export function parseWorkspaces(value: unknown): Workspace[] | null {
    if (!Array.isArray(value)) return null;
    const valid = value.every((item) => isObject(item) && typeof item.id === "string" && typeof item.name === "string");
    return valid ? value.map(({ id, name }: Workspace) => ({ id, name })) : null;
}

/** Also used for server answers; null means the data is not valid. */
export function parseStoredPages(value: unknown): StoredPage[] | null {
    if (!Array.isArray(value)) return null;
    const valid = value.every(
        (item) =>
            isObject(item) &&
            typeof item.id === "string" &&
            typeof item.title === "string" &&
            (item.parent_id === null || typeof item.parent_id === "string") &&
            typeof item.is_archived === "boolean",
    );
    // Trees cached before packages 10, 11b and 12b have no icon, width,
    // owner or section; they stay valid (no owner: not shareable until
    // reloaded).
    return valid
        ? value.map(
              ({
                  id,
                  title,
                  parent_id,
                  owner_id,
                  visibility,
                  is_archived,
                  icon,
                  full_width,
                  kind,
                  position,
                  created_at,
                  is_template,
                  favorite,
                  favorites,
                  cover,
              }: StoredPage & { favorites?: unknown }) => ({
                  id,
                  title,
                  parent_id,
                  owner_id: typeof owner_id === "string" ? owner_id : "",
                  // Before package 12b; since 12a all existing pages are private.
                  visibility: visibility === "workspace" ? "workspace" : "private",
                  is_archived,
                  icon: typeof icon === "string" ? icon : null,
                  full_width: full_width === true,
                  // Before package 14b there were no databases.
                  kind: kind === "database" ? "database" : "page",
                  position: typeof position === "number" ? position : null,
                  created_at: typeof created_at === "string" ? created_at : "",
                  // Before package 26 there were no templates.
                  ...(is_template === true ? { is_template: true } : {}),
                  // Before package 30c there were no covers.
                  ...(typeof cover === "string" && cover ? { cover } : {}),
                  // The server embeds the user's own favorite rows (package 30b), the cache keeps the flag.
                  ...(favorite === true || (Array.isArray(favorites) && favorites.length > 0)
                      ? { favorite: true }
                      : {}),
              }),
          )
        : null;
}

/**
 * Read-only copy of the workspaces and page trees last loaded from the
 * server (CLAUDE.md §2: cached for reading only, changes need the server).
 */
export class PageTreeCache {
    private readonly connection: DatabaseConnection;

    constructor(userId: string, factory: IDBFactory = indexedDB) {
        this.connection = new DatabaseConnection(factory, pageTreeDatabaseName(userId), DATABASE_VERSION, (database) =>
            database.createObjectStore(SNAPSHOTS),
        );
    }

    async getWorkspaces(): Promise<Workspace[] | null> {
        return parseWorkspaces(await this.read(WORKSPACES_KEY));
    }

    putWorkspaces(workspaces: Workspace[]): Promise<void> {
        return this.write(WORKSPACES_KEY, workspaces);
    }

    async getPages(workspaceId: string): Promise<StoredPage[] | null> {
        return parseStoredPages(await this.read(pagesKey(workspaceId)));
    }

    putPages(workspaceId: string, pages: StoredPage[]): Promise<void> {
        return this.write(pagesKey(workspaceId), pages);
    }

    /** Pages shared with the user from workspaces they are not a member of. */
    async getSharedPages(): Promise<StoredPage[] | null> {
        return parseStoredPages(await this.read(SHARED_PAGES_KEY));
    }

    putSharedPages(pages: StoredPage[]): Promise<void> {
        return this.write(SHARED_PAGES_KEY, pages);
    }

    /** Properties, views and values of a database; parsed by the databases feature. */
    getDatabase(databaseId: string): Promise<unknown> {
        return this.read(databaseKey(databaseId));
    }

    putDatabase(databaseId: string, data: unknown): Promise<void> {
        return this.write(databaseKey(databaseId), data);
    }

    /** The same for a "Datenbank" block in a page, with the block's own views (package 19c). */
    getDatabaseBlock(pageId: string, blockId: string): Promise<unknown> {
        return this.read(databaseBlockKey(pageId, blockId));
    }

    putDatabaseBlock(pageId: string, blockId: string, data: unknown): Promise<void> {
        return this.write(databaseBlockKey(pageId, blockId), data);
    }

    close(): Promise<void> {
        return this.connection.close();
    }

    private async read(key: string): Promise<unknown> {
        const database = await this.connection.open();
        return promisify(database.transaction(SNAPSHOTS).objectStore(SNAPSHOTS).get(key));
    }

    private async write(key: string, value: unknown): Promise<void> {
        const database = await this.connection.open();
        const transaction = database.transaction(SNAPSHOTS, "readwrite");
        transaction.objectStore(SNAPSHOTS).put(value, key);
        await completion(transaction);
    }
}

const cachesByUser = new Map<string, PageTreeCache>();

export function pageTreeCacheFor(userId: string): PageTreeCache {
    let cache = cachesByUser.get(userId);
    if (!cache) {
        cache = new PageTreeCache(userId);
        cachesByUser.set(userId, cache);
    }
    return cache;
}

/** Closes the shared cache before the account's data is deleted. */
export async function closePageTreeCache(userId: string): Promise<void> {
    const cache = cachesByUser.get(userId);
    cachesByUser.delete(userId);
    await cache?.close();
}
