import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteRequestError } from "@/lib/request-errors";
import type { LocalDocument, RemoteDocument, RemoteDocumentApi, SaveOutcome } from "../types";
import type { DocumentChanges } from "./document-changes";
import { LocalDocumentStore } from "./local-document-store";
import {
    loadInitialDocument,
    PageDocumentSession,
    type PageDocumentSessionOptions,
    type SessionStatus,
} from "./page-document-session";
import { SyncEngine } from "./sync-engine";

const pageId = "page-1";
const ownId = "00000000-0000-4000-8000-0000000000a1";
const otherDeviceId = "00000000-0000-4000-8000-0000000000ff";

const synced = (overrides: Partial<LocalDocument> = {}): LocalDocument => ({
    pageId,
    content: [{ type: "paragraph", content: "server" }],
    editedAt: "2026-10-17T09:00:00.000Z",
    mutationId: "00000000-0000-4000-8000-000000000001",
    synced: true,
    canEdit: true,
    ...overrides,
});

const newerRemote: RemoteDocument = {
    content: [{ type: "paragraph", content: "other device" }],
    editedAt: "2026-10-17T11:00:00.000Z",
    mutationId: otherDeviceId,
};

function createRemote(saveOutcome: SaveOutcome = { kind: "saved" }) {
    return {
        fetch: vi.fn<RemoteDocumentApi["fetch"]>(async () => ({
            document: newerRemote,
            canEdit: true,
        })),
        save: vi.fn<RemoteDocumentApi["save"]>(async () => saveOutcome),
    };
}

let store: LocalDocumentStore;
let changes: DocumentChanges;
let statuses: SessionStatus[];
let remoteContent: ReturnType<typeof vi.fn<PageDocumentSessionOptions["onRemoteContent"]>>;

/** Delivers asynchronously like BroadcastChannel, to every subscriber. */
function createChanges(): DocumentChanges {
    const listeners = new Set<(pageId: string) => void>();
    return {
        announce: (changedPageId) =>
            queueMicrotask(() => listeners.forEach((listener) => listener(changedPageId))),
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
}

function createSession(remote: RemoteDocumentApi) {
    const sync = new SyncEngine({
        userId: "user-1",
        store,
        remote,
        changes,
        lock: (_name, task) => task(),
    });
    return new PageDocumentSession({
        pageId,
        store,
        remote,
        changes,
        sync,
        onStatus: (status) => statuses.push(status),
        onRemoteContent: remoteContent,
        onPermission: () => undefined,
        now: () => new Date("2026-10-17T10:00:00.000Z"),
        createMutationId: () => ownId,
    });
}

const lastStatus = () => statuses.at(-1);

beforeEach(() => {
    store = new LocalDocumentStore("user-1", new IDBFactory());
    changes = createChanges();
    statuses = [];
    remoteContent = vi.fn<PageDocumentSessionOptions["onRemoteContent"]>();
});

describe("PageDocumentSession", () => {
    it("stores an edit locally, lets the engine send it and shows synced", async () => {
        const remote = createRemote();
        const session = createSession(remote);
        await session.start(synced(), { freshFromServer: true });

        session.recordEdit([{ type: "paragraph", content: "edit" }]);
        await session.flush();

        await vi.waitFor(() => expect(lastStatus()).toEqual({ kind: "synced" }));
        expect(remote.save).toHaveBeenCalledWith(
            pageId,
            [{ type: "paragraph", content: "edit" }],
            { editedAt: "2026-10-17T10:00:00.000Z", mutationId: ownId },
        );
        expect(await store.get(pageId)).toMatchObject({ synced: true, mutationId: ownId });
    });

    it("keeps the edit locally when offline and sends it on retry", async () => {
        const remote = createRemote({ kind: "failed", reason: "offline", message: "Failed to fetch" });
        const session = createSession(remote);
        await session.start(synced(), { freshFromServer: true });

        session.recordEdit([{ type: "paragraph", content: "offline edit" }]);
        await session.flush();

        await vi.waitFor(() => expect(lastStatus()).toEqual({ kind: "unsynced", reason: "offline" }));
        expect(await store.get(pageId)).toMatchObject({
            synced: false,
            content: [{ type: "paragraph", content: "offline edit" }],
        });

        remote.save.mockResolvedValue({ kind: "saved" });
        await session.retry();

        await vi.waitFor(() => expect(lastStatus()).toEqual({ kind: "synced" }));
        expect(await store.get(pageId)).toMatchObject({ synced: true });
    });

    it("loads the newer version when the edit is superseded (Option A)", async () => {
        const remote = createRemote({
            kind: "superseded",
            stored: { editedAt: newerRemote.editedAt, mutationId: otherDeviceId },
        });
        const session = createSession(remote);
        await session.start(synced(), { freshFromServer: true });

        session.recordEdit([{ type: "paragraph", content: "older edit" }]);
        await session.flush();

        await vi.waitFor(() => expect(remoteContent).toHaveBeenCalledWith(newerRemote.content, true));
        expect(await store.get(pageId)).toMatchObject({ synced: true, mutationId: otherDeviceId });
        expect(lastStatus()).toEqual({ kind: "synced" });
    });

    it("never reports a permanent failure as saved and keeps the edit", async () => {
        const remote = createRemote({ kind: "failed", reason: "permanent", message: "permission denied" });
        const session = createSession(remote);
        await session.start(synced(), { freshFromServer: true });
        const statusesBeforeEdit = statuses.length;

        session.recordEdit([{ type: "paragraph", content: "edit" }]);
        await session.flush();

        await vi.waitFor(() => expect(lastStatus()).toEqual({ kind: "error", message: "permission denied" }));
        expect(statuses.slice(statusesBeforeEdit)).not.toContainEqual({ kind: "synced" });
        expect(await store.get(pageId)).toMatchObject({ synced: false });
    });

    it("hands an unsynced local copy to the engine right after opening", async () => {
        const remote = createRemote();
        const session = createSession(remote);
        const unsynced = synced({ synced: false, mutationId: ownId });
        await store.putLocalEdit(unsynced);

        await session.start(unsynced, { freshFromServer: false });

        expect(remote.save).toHaveBeenCalledTimes(1);
        expect(remote.fetch).not.toHaveBeenCalled();
        await vi.waitFor(() => expect(lastStatus()).toEqual({ kind: "synced" }));
    });

    it("updates a synced local copy with a newer server version", async () => {
        const remote = createRemote();
        const session = createSession(remote);
        await store.putLocalEdit(synced());

        await session.start(synced(), { freshFromServer: false });

        await vi.waitFor(() => expect(remoteContent).toHaveBeenCalledWith(newerRemote.content, false));
        expect(lastStatus()).toEqual({ kind: "synced" });
    });

    it("does not overwrite what the user types while the server is asked", async () => {
        const remote = createRemote();
        let resolveFetch: () => void = () => undefined;
        remote.fetch.mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolveFetch = () => resolve({ document: newerRemote, canEdit: true });
                }),
        );
        const session = createSession(remote);
        await store.putLocalEdit(synced());

        const started = session.start(synced(), { freshFromServer: false });
        await vi.waitFor(() => expect(remote.fetch).toHaveBeenCalled());
        session.recordEdit([{ type: "paragraph", content: "typed meanwhile" }]);
        resolveFetch();
        await started;
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(remoteContent).not.toHaveBeenCalled();
    });

    it("shows offline when the server cannot be reached and nothing is pending", async () => {
        const remote = createRemote();
        remote.fetch.mockRejectedValue(new RemoteRequestError("offline", "Failed to fetch"));
        const session = createSession(remote);
        await store.putLocalEdit(synced());

        await session.start(synced(), { freshFromServer: false });

        expect(lastStatus()).toEqual({ kind: "offline" });
    });

    it("shows an edit made in another tab", async () => {
        const remote = createRemote({ kind: "failed", reason: "offline", message: "Failed to fetch" });
        const session = createSession(remote);
        await store.putLocalEdit(synced());
        await session.start(synced(), { freshFromServer: true });

        const otherTabEdit = synced({
            content: [{ type: "paragraph", content: "other tab" }],
            editedAt: "2026-10-17T10:30:00.000Z",
            mutationId: "00000000-0000-4000-8000-0000000000b2",
            synced: false,
        });
        await store.putLocalEdit(otherTabEdit);
        changes.announce(pageId);

        await vi.waitFor(() => expect(remoteContent).toHaveBeenCalledWith(otherTabEdit.content, false));
        expect(lastStatus()).toEqual({ kind: "saving" });
    });

    it("stores further edits while the server does not answer", async () => {
        const remote = createRemote();
        remote.save.mockImplementation(() => new Promise(() => undefined));
        const session = createSession(remote);
        await session.start(synced(), { freshFromServer: true });

        session.recordEdit([{ type: "paragraph", content: "first" }]);
        await session.flush();
        await vi.waitFor(() => expect(remote.save).toHaveBeenCalled());

        session.recordEdit([{ type: "paragraph", content: "second" }]);
        await session.flush();

        expect(await store.get(pageId)).toMatchObject({
            content: [{ type: "paragraph", content: "second" }],
            synced: false,
        });
    });

    it("stores an edit while loading a newer version hangs", async () => {
        const remote = createRemote();
        remote.fetch.mockImplementation(() => new Promise(() => undefined));
        const session = createSession(remote);
        await store.putLocalEdit(synced());
        void session.start(synced(), { freshFromServer: false });
        await vi.waitFor(() => expect(remote.fetch).toHaveBeenCalled());

        session.recordEdit([{ type: "paragraph", content: "typed" }]);
        await session.flush();

        expect(await store.get(pageId)).toMatchObject({
            content: [{ type: "paragraph", content: "typed" }],
            synced: false,
        });
    });

    it("keeps an edit that is being stored when another tab changes the page", async () => {
        const remote = createRemote({ kind: "failed", reason: "offline", message: "Failed to fetch" });
        const session = createSession(remote);
        await store.putLocalEdit(synced());
        await session.start(synced(), { freshFromServer: true });

        // Another tab stores a version; its announcement is processed while
        // our edit is on its way into the store.
        await store.putLocalEdit(
            synced({
                content: [{ type: "paragraph", content: "other tab" }],
                editedAt: "2026-10-17T09:30:00.000Z",
                mutationId: "00000000-0000-4000-8000-0000000000b2",
                synced: false,
            }),
        );
        changes.announce(pageId);
        // Let the session start reading the other tab's version first.
        for (let tick = 0; tick < 3; tick += 1) await Promise.resolve();
        session.recordEdit([{ type: "paragraph", content: "ours" }]);
        await session.flush();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(remoteContent).not.toHaveBeenCalled();
        expect(await store.get(pageId)).toMatchObject({ content: [{ type: "paragraph", content: "ours" }] });
    });

    it("reports a failed refresh as a loading problem, not as a failed save", async () => {
        const remote = createRemote();
        remote.fetch.mockRejectedValue(new RemoteRequestError("permanent", "Unerwartetes Dokumentformat vom Server."));
        const session = createSession(remote);
        await store.putLocalEdit(synced());
        vi.spyOn(console, "error").mockImplementation(() => undefined);

        await session.start(synced(), { freshFromServer: false });

        expect(lastStatus()).toEqual({
            kind: "loadFailed",
            message: "Unerwartetes Dokumentformat vom Server.",
        });
    });
});

describe("loadInitialDocument", () => {
    it("prefers the local copy and does not ask the server", async () => {
        const remote = createRemote();
        await store.putLocalEdit(synced());

        const initial = await loadInitialDocument(pageId, store, remote);

        expect(initial).toEqual({ document: synced(), freshFromServer: false });
        expect(remote.fetch).not.toHaveBeenCalled();
    });

    it("loads a page opened for the first time from the server and keeps it", async () => {
        const remote = createRemote();

        const initial = await loadInitialDocument(pageId, store, remote);

        expect(initial.freshFromServer).toBe(true);
        expect(initial.document).toMatchObject({ content: newerRemote.content, synced: true });
        expect(await store.get(pageId)).toEqual(initial.document);
    });

    it("fails offline when the page has never been opened here", async () => {
        const remote = createRemote();
        remote.fetch.mockRejectedValue(new RemoteRequestError("offline", "Failed to fetch"));

        await expect(loadInitialDocument(pageId, store, remote)).rejects.toMatchObject({
            reason: "offline",
        });
        expect(await store.get(pageId)).toBeNull();
    });
});
