export function promisify<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export function completion(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
    });
}

/**
 * One lazily opened connection to a database. When the database is deleted
 * (logout, possibly in another tab) the connection closes and is never
 * reopened, so no tab recreates data of a signed-out account.
 */
export class DatabaseConnection {
    private database: Promise<IDBDatabase> | null = null;
    private closed = false;
    private readonly factory: IDBFactory;
    private readonly name: string;
    private readonly version: number;
    private readonly upgrade: (database: IDBDatabase, oldVersion: number) => void;

    constructor(
        factory: IDBFactory,
        name: string,
        version: number,
        upgrade: (database: IDBDatabase, oldVersion: number) => void,
    ) {
        this.factory = factory;
        this.name = name;
        this.version = version;
        this.upgrade = upgrade;
    }

    open(): Promise<IDBDatabase> {
        if (this.closed) {
            return Promise.reject(new Error("Die lokalen Daten dieses Kontos wurden gelöscht."));
        }
        this.database ??= this.connect();
        return this.database;
    }

    /** Closes the connection for good, before the database is deleted. */
    async close(): Promise<void> {
        this.closed = true;
        const pending = this.database;
        this.database = null;
        if (!pending) return;

        try {
            (await pending).close();
        } catch (error) {
            // Opening had failed; there is no connection to close.
            console.warn("Lokale Datenbank war nicht geöffnet:", error);
        }
    }

    private async connect(): Promise<IDBDatabase> {
        const request = this.factory.open(this.name, this.version);
        request.onupgradeneeded = (event) => this.upgrade(request.result, event.oldVersion);

        const database = await promisify(request);
        database.onversionchange = (event) => {
            database.close();
            this.database = null;
            // newVersion null: the database is being deleted.
            if (event.newVersion === null) this.closed = true;
        };
        return database;
    }
}

/**
 * Deletes a database. If another tab still holds a connection, deletion
 * completes as soon as that tab closes it; this does not wait for that.
 */
export function deleteDatabase(factory: IDBFactory, name: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = factory.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => {
            console.warn("Lokale Datenbank wird gelöscht, sobald andere Tabs sie freigeben:", name);
            resolve();
        };
    });
}
