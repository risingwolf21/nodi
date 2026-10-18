import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalDocument, RemoteDocumentApi, SaveOutcome } from "../types";
import type { DocumentChanges } from "./document-changes";
import { LocalDocumentStore } from "./local-document-store";
import {
    SYNC_MAX_ATTEMPTS,
    SYNC_RETRY_BASE_MS,
    SyncEngine,
    type SyncFailure,
} from "./sync-engine";

const otherDeviceId = "00000000-0000-4000-8000-0000000000ff";

const unsynced = (pageId: string, mutationId: string): LocalDocument => ({
    pageId,
    content: [{ type: "paragraph", content: `edit ${pageId}` }],
    editedAt: "2026-10-18T09:00:00.000Z",
    mutationId,
    synced: false,
    canEdit: true,
});

const offline: SaveOutcome = { kind: "failed", reason: "offline", message: "Failed to fetch" };

function createRemote() {
    return {
        fetch: vi.fn<RemoteDocumentApi["fetch"]>(async () => ({
            document: {
                content: [{ type: "paragraph", content: "other device" }],
                editedAt: "2026-10-18T10:00:00.000Z",
                mutationId: otherDeviceId,
            },
            canEdit: true,
        })),
        save: vi.fn<RemoteDocumentApi["save"]>(async (): Promise<SaveOutcome> => ({ kind: "saved" })),
    };
}

let store: LocalDocumentStore;
let announced: string[];
let changes: DocumentChanges;
let failures: SyncFailure[];

function createEngine(remote: RemoteDocumentApi, lock?: (name: string, task: () => Promise<void>) => Promise<void>) {
    const engine = new SyncEngine({
        userId: "user-1",
        store,
        remote,
        changes,
        lock: lock ?? ((_name, task) => task()),
    });
    engine.onFailure((failure) => failures.push(failure));
    return engine;
}

beforeEach(() => {
    store = new LocalDocumentStore("user-1", new IDBFactory());
    announced = [];
    changes = { announce: (pageId) => announced.push(pageId), subscribe: () => () => undefined };
    failures = [];
});

afterEach(() => {
    vi.useRealTimers();
});

describe("SyncEngine", () => {
    it("sends the unsynced edits of all pages and marks them synced", async () => {
        const remote = createRemote();
        await store.putLocalEdit(unsynced("page-1", "00000000-0000-4000-8000-000000000001"));
        await store.putLocalEdit(unsynced("page-2", "00000000-0000-4000-8000-000000000002"));
        await store.putLocalEdit({ ...unsynced("page-3", "00000000-0000-4000-8000-000000000003"), synced: true });

        await createEngine(remote).requestSync();

        expect(remote.save).toHaveBeenCalledTimes(2);
        expect(await store.listUnsynced()).toEqual([]);
        expect(announced.sort()).toEqual(["page-1", "page-2"]);
    });

    it("takes over the newer server version when an edit is superseded", async () => {
        const remote = createRemote();
        remote.save.mockResolvedValue({
            kind: "superseded",
            stored: { editedAt: "2026-10-18T10:00:00.000Z", mutationId: otherDeviceId },
        });
        await store.putLocalEdit(unsynced("page-1", "00000000-0000-4000-8000-000000000001"));

        await createEngine(remote).requestSync();

        expect(await store.get("page-1")).toMatchObject({
            synced: true,
            mutationId: otherDeviceId,
            content: [{ type: "paragraph", content: "other device" }],
        });
        expect(announced).toEqual(["page-1"]);
    });

    it("reports offline for every waiting edit and retries with growing delays", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        const remote = createRemote();
        remote.save.mockResolvedValue(offline);
        await store.putLocalEdit(unsynced("page-1", "00000000-0000-4000-8000-000000000001"));
        await store.putLocalEdit(unsynced("page-2", "00000000-0000-4000-8000-000000000002"));
        const engine = createEngine(remote);

        await engine.requestSync();

        // The pass stops at the first offline failure but reports both pages.
        expect(remote.save).toHaveBeenCalledTimes(1);
        expect(failures.map((failure) => [failure.pageId, failure.reason])).toEqual([
            ["page-1", "offline"],
            ["page-2", "offline"],
        ]);

        await vi.advanceTimersByTimeAsync(SYNC_RETRY_BASE_MS);
        expect(remote.save).toHaveBeenCalledTimes(2);

        // Second delay is twice as long.
        await vi.advanceTimersByTimeAsync(SYNC_RETRY_BASE_MS * 2 - 1);
        expect(remote.save).toHaveBeenCalledTimes(2);
        remote.save.mockResolvedValue({ kind: "saved" });
        await vi.advanceTimersByTimeAsync(1);

        await vi.waitFor(async () => expect(await store.listUnsynced()).toEqual([]));
    });

    it("stops timed retries after the maximum number of attempts", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        const remote = createRemote();
        remote.save.mockResolvedValue(offline);
        await store.putLocalEdit(unsynced("page-1", "00000000-0000-4000-8000-000000000001"));
        const engine = createEngine(remote);

        await engine.requestSync();
        await vi.advanceTimersByTimeAsync(24 * 60 * 60_000);

        expect(remote.save).toHaveBeenCalledTimes(SYNC_MAX_ATTEMPTS);
        expect(vi.getTimerCount()).toBe(0);
    });

    it("schedules no retry after it was stopped", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        const remote = createRemote();
        remote.save.mockResolvedValue(offline);
        await store.putLocalEdit(unsynced("page-1", "00000000-0000-4000-8000-000000000001"));
        const engine = createEngine(remote);

        const pass = engine.requestSync();
        engine.stop();
        await pass;

        expect(vi.getTimerCount()).toBe(0);
    });

    it("keeps a permanently failed edit and does not resend it until asked", async () => {
        const remote = createRemote();
        remote.save.mockResolvedValue({ kind: "failed", reason: "permanent", message: "permission denied" });
        await store.putLocalEdit(unsynced("page-1", "00000000-0000-4000-8000-000000000001"));
        const engine = createEngine(remote);

        await engine.requestSync();
        await engine.requestSync();

        expect(remote.save).toHaveBeenCalledTimes(1);
        expect(failures).toHaveLength(2);
        expect(failures[1]).toMatchObject({ reason: "permanent", message: "permission denied" });
        expect(await store.listUnsynced()).toHaveLength(1);

        remote.save.mockResolvedValue({ kind: "saved" });
        await engine.retryNow();

        expect(remote.save).toHaveBeenCalledTimes(2);
        expect(await store.listUnsynced()).toEqual([]);
    });

    it("runs one more pass for an edit stored during a pass", async () => {
        const remote = createRemote();
        await store.putLocalEdit(unsynced("page-1", "00000000-0000-4000-8000-000000000001"));
        let releaseFirstSave: () => void = () => undefined;
        remote.save.mockImplementationOnce(
            () => new Promise((resolve) => (releaseFirstSave = () => resolve({ kind: "saved" }))),
        );
        const engine = createEngine(remote);

        const firstPass = engine.requestSync();
        await vi.waitFor(() => expect(remote.save).toHaveBeenCalledTimes(1));
        await store.putLocalEdit(unsynced("page-2", "00000000-0000-4000-8000-000000000002"));
        const secondRequest = engine.requestSync();
        releaseFirstSave();
        await Promise.all([firstPass, secondRequest]);

        expect(remote.save).toHaveBeenCalledTimes(2);
        expect(await store.listUnsynced()).toEqual([]);
    });

    it("lets only one tab send at a time", async () => {
        const remote = createRemote();
        await store.putLocalEdit(unsynced("page-1", "00000000-0000-4000-8000-000000000001"));

        let held: Promise<void> = Promise.resolve();
        const sharedLock = (_name: string, task: () => Promise<void>) => {
            const run = held.then(task);
            held = run.catch(() => undefined);
            return run;
        };

        await Promise.all([
            createEngine(remote, sharedLock).requestSync(),
            createEngine(remote, sharedLock).requestSync(),
        ]);

        expect(remote.save).toHaveBeenCalledTimes(1);
    });

    it("counts unsynced pages and keeps the failure reason for the overview", async () => {
        const remote = createRemote();
        remote.save.mockResolvedValue(offline);
        await store.putLocalEdit(unsynced("page-1", "00000000-0000-4000-8000-000000000001"));
        await store.putLocalEdit(unsynced("page-2", "00000000-0000-4000-8000-000000000002"));
        const engine = createEngine(remote);
        const overviews: unknown[] = [];
        engine.subscribeOverview(() => overviews.push(engine.getOverview()));

        await engine.requestSync();
        expect(engine.getOverview()).toEqual({ unsyncedPages: 2, failure: "offline" });

        remote.save.mockResolvedValue({ kind: "saved" });
        await engine.requestSync();
        expect(engine.getOverview()).toEqual({ unsyncedPages: 0, failure: null });
        expect(overviews).toHaveLength(2);
    });

    it("stores pending edits of open editors before syncing everything", async () => {
        const remote = createRemote();
        const engine = createEngine(remote);
        engine.addFlusher(() =>
            store.putLocalEdit(unsynced("page-1", "00000000-0000-4000-8000-000000000001")),
        );

        const remaining = await engine.syncAll();

        expect(remote.save).toHaveBeenCalledTimes(1);
        expect(remaining).toBe(0);
    });

    it("reports how many pages stay unsynced when syncing before a logout fails", async () => {
        const remote = createRemote();
        remote.save.mockResolvedValue(offline);
        await store.putLocalEdit(unsynced("page-1", "00000000-0000-4000-8000-000000000001"));

        expect(await createEngine(remote).syncAll()).toBe(1);
    });
});
