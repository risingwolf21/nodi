import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalDocument } from "../types";
import { LocalDocumentStore } from "./local-document-store";

type PagesResponse = {
    data: { id: string }[] | null;
    count: number | null;
    error: { message: string; code?: string } | null;
    status: number;
};

const supabaseMock = vi.hoisted(() => ({ response: null as unknown, sessionUserId: "user-1" as string | null }));

vi.mock("@/lib/supabase", () => ({
    supabase: {
        auth: {
            getSession: () =>
                Promise.resolve({
                    data: { session: supabaseMock.sessionUserId ? { user: { id: supabaseMock.sessionUserId } } : null },
                }),
        },
        from: () => ({ select: () => Promise.resolve(supabaseMock.response) }),
    },
}));

const { deleteRevokedLocalCopies } = await import("./revoked-documents");

const synced = (pageId: string): LocalDocument => ({
    pageId,
    content: [],
    editedAt: "2026-10-18T10:00:00.000Z",
    mutationId: null,
    synced: true,
    canEdit: false,
});

let store: LocalDocumentStore;

function answer(response: PagesResponse) {
    supabaseMock.response = response;
}

beforeEach(async () => {
    supabaseMock.sessionUserId = "user-1";
    store = new LocalDocumentStore("user-1", new IDBFactory());
    await store.putLocalEdit(synced("readable"));
    await store.putLocalEdit(synced("revoked"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("deleteRevokedLocalCopies", () => {
    it("deletes copies of pages the server no longer returns", async () => {
        answer({ data: [{ id: "readable" }], count: 1, error: null, status: 200 });

        expect(await deleteRevokedLocalCopies("user-1", store)).toEqual(["revoked"]);
        expect(await store.get("readable")).not.toBeNull();
        expect(await store.get("revoked")).toBeNull();
    });

    it("keeps everything when the server is not reachable", async () => {
        answer({ data: null, count: null, error: { message: "Failed to fetch", code: "" }, status: 0 });

        expect(await deleteRevokedLocalCopies("user-1", store)).toEqual([]);
        expect(await store.get("revoked")).not.toBeNull();
    });

    it("keeps everything without a session of this account (RLS would answer as anon)", async () => {
        supabaseMock.sessionUserId = null;
        answer({ data: [], count: 0, error: null, status: 200 });

        expect(await deleteRevokedLocalCopies("user-1", store)).toEqual([]);
        expect(await store.get("readable")).not.toBeNull();
    });

    it("keeps everything when the list is truncated", async () => {
        answer({ data: [{ id: "readable" }], count: 1001, error: null, status: 200 });

        expect(await deleteRevokedLocalCopies("user-1", store)).toEqual([]);
        expect(await store.get("revoked")).not.toBeNull();
    });
});
