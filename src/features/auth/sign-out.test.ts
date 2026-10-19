import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const engine = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }));
const deleteDatabase = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/features/editor/services/account-sync", () => ({
    syncEngineFor: () => engine,
    forgetSyncEngine: vi.fn(),
}));
vi.mock("@/features/editor/services/local-document-store", () => ({
    closeLocalDocumentStore: vi.fn(async () => undefined),
    localDatabaseName: (userId: string) => `nodi-${userId}`,
}));
vi.mock("@/features/pages/services/page-tree-cache", () => ({
    closePageTreeCache: vi.fn(async () => undefined),
    pageTreeDatabaseName: (userId: string) => `nodi-${userId}-tree`,
}));
vi.mock("@/features/files/services/file-cache", () => ({
    closeFileCache: vi.fn(async () => undefined),
    fileCacheDatabaseName: (userId: string) => `nodi-${userId}-files`,
}));
vi.mock("@/lib/indexed-db", () => ({ deleteDatabase }));

const { signOutAndDeleteLocalData } = await import("./sign-out");

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("indexedDB", new IDBFactory());
});

describe("signOutAndDeleteLocalData", () => {
    it("deletes the local data after signing out", async () => {
        await signOutAndDeleteLocalData("u1", async () => undefined);

        expect(engine.stop).toHaveBeenCalled();
        expect(engine.start).not.toHaveBeenCalled();
        // Documents, page tree and cached images (package 15).
        expect(deleteDatabase.mock.calls.map((call: unknown[]) => call[1])).toEqual([
            "nodi-u1",
            "nodi-u1-tree",
            "nodi-u1-files",
        ]);
    });

    it("keeps syncing and deletes nothing when signing out fails", async () => {
        const failure = new Error("Auth server error");

        await expect(
            signOutAndDeleteLocalData("u1", async () => {
                throw failure;
            }),
        ).rejects.toBe(failure);

        expect(engine.start).toHaveBeenCalled();
        expect(deleteDatabase).not.toHaveBeenCalled();
    });
});
