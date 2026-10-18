import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import type { LocalDocument, RemoteDocument } from "../types";
import { LocalDocumentStore, localDatabaseName } from "./local-document-store";

const pageId = "page-1";
const idA = "00000000-0000-4000-8000-00000000000a";
const idB = "00000000-0000-4000-8000-00000000000b";

const localEdit = (overrides: Partial<LocalDocument> = {}): LocalDocument => ({
    pageId,
    content: [{ type: "paragraph", content: "local" }],
    editedAt: "2026-10-17T10:00:00.000Z",
    mutationId: idA,
    synced: false,
    canEdit: true,
    ...overrides,
});

const remote = (overrides: Partial<RemoteDocument> = {}): RemoteDocument => ({
    content: [{ type: "paragraph", content: "remote" }],
    editedAt: "2026-10-17T11:00:00.000Z",
    mutationId: idB,
    ...overrides,
});

let factory: IDBFactory;
let store: LocalDocumentStore;

beforeEach(() => {
    factory = new IDBFactory();
    store = new LocalDocumentStore("user-1", factory);
});

describe("LocalDocumentStore", () => {
    it("stores and reads a local edit", async () => {
        await store.putLocalEdit(localEdit());
        expect(await store.get(pageId)).toEqual(localEdit());
    });

    it("returns null for unknown pages", async () => {
        expect(await store.get("unknown")).toBeNull();
    });

    it("keeps accounts in separate databases", async () => {
        await store.putLocalEdit(localEdit());
        const otherUser = new LocalDocumentStore("user-2", factory);

        expect(localDatabaseName("user-1")).not.toBe(localDatabaseName("user-2"));
        expect(await otherUser.get(pageId)).toBeNull();
    });

    it("ignores invalid stored records", async () => {
        const request = factory.open(localDatabaseName("user-1"), 1);
        request.onupgradeneeded = () =>
            request.result.createObjectStore("documents", { keyPath: "pageId" });
        await new Promise<void>((resolve) => {
            request.onsuccess = () => {
                const transaction = request.result.transaction("documents", "readwrite");
                transaction.objectStore("documents").put({ pageId, content: "broken" });
                transaction.oncomplete = () => {
                    request.result.close();
                    resolve();
                };
            };
        });

        expect(await store.get(pageId)).toBeNull();
    });

    it("lists only documents with unsynced edits", async () => {
        await store.putLocalEdit(localEdit());
        await store.putLocalEdit(localEdit({ pageId: "page-2", synced: true }));

        expect(await store.listUnsynced()).toEqual([localEdit()]);
    });

    describe("markSynced", () => {
        it("marks the version that was sent", async () => {
            await store.putLocalEdit(localEdit());
            expect(await store.markSynced(pageId, idA)).toBe(true);
            expect((await store.get(pageId))?.synced).toBe(true);
        });

        it("does not mark a newer local edit", async () => {
            await store.putLocalEdit(localEdit({ mutationId: idB }));
            expect(await store.markSynced(pageId, idA)).toBe(false);
            expect((await store.get(pageId))?.synced).toBe(false);
        });
    });

    describe("applyRemote", () => {
        it("stores the remote document when nothing is cached", async () => {
            const result = await store.applyRemote(pageId, remote(), true);

            expect(result.replaced).toBe(true);
            expect(result.record).toMatchObject({ synced: true, canEdit: true, mutationId: idB });
        });

        it("stores an empty document when the page has none yet", async () => {
            const result = await store.applyRemote(pageId, null, false);

            expect(result.record).toMatchObject({ content: [], mutationId: null, canEdit: false });
        });

        it("replaces an older synced copy", async () => {
            await store.putLocalEdit(localEdit({ synced: true }));
            const result = await store.applyRemote(pageId, remote(), true);

            expect(result.replaced).toBe(true);
            expect((await store.get(pageId))?.mutationId).toBe(idB);
        });

        it("keeps a newer synced copy", async () => {
            await store.putLocalEdit(
                localEdit({ synced: true, editedAt: "2026-10-17T12:00:00.000Z" }),
            );
            const result = await store.applyRemote(pageId, remote(), true);

            expect(result.replaced).toBe(false);
            expect((await store.get(pageId))?.mutationId).toBe(idA);
        });

        it("never discards an unsynced local edit", async () => {
            await store.putLocalEdit(localEdit());
            const result = await store.applyRemote(pageId, remote(), false);

            expect(result.replaced).toBe(false);
            expect(await store.get(pageId)).toEqual(localEdit({ canEdit: false }));
        });

        it("replaces the local edit the server rejected", async () => {
            await store.putLocalEdit(localEdit());
            const result = await store.applyRemote(pageId, remote(), true, idA);

            expect(result.replaced).toBe(true);
            expect((await store.get(pageId))?.mutationId).toBe(idB);
        });
    });
});
