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
        expect(deleteDatabase).toHaveBeenCalledTimes(2);
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
