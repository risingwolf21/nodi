import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import type { StoredPage } from "../types";
import { PageTreeCache, parseStoredPages } from "./page-tree-cache";

let cache: PageTreeCache;

beforeEach(() => {
    cache = new PageTreeCache("user-1", new IDBFactory());
});

describe("PageTreeCache", () => {
    it("returns null before anything was cached", async () => {
        expect(await cache.getWorkspaces()).toBeNull();
        expect(await cache.getPages("w1")).toBeNull();
    });

    it("keeps workspaces and the pages of each workspace", async () => {
        await cache.putWorkspaces([{ id: "w1", name: "Persönlich" }]);
        await cache.putPages("w1", [
            {
                id: "p1",
                title: "A",
                parent_id: null,
                owner_id: "u1",
                visibility: "private",
                is_archived: false,
                icon: "📘",
                full_width: true,
                kind: "page",
                position: null,
                created_at: "",
            },
        ]);
        await cache.putPages("w2", [
            {
                id: "p2",
                title: "B",
                parent_id: null,
                owner_id: "u1",
                visibility: "private",
                is_archived: true,
                icon: null,
                full_width: false,
                kind: "page",
                position: null,
                created_at: "",
            },
        ]);

        expect(await cache.getWorkspaces()).toEqual([{ id: "w1", name: "Persönlich" }]);
        expect(await cache.getPages("w1")).toEqual([
            {
                id: "p1",
                title: "A",
                parent_id: null,
                owner_id: "u1",
                visibility: "private",
                is_archived: false,
                icon: "📘",
                full_width: true,
                kind: "page",
                position: null,
                created_at: "",
            },
        ]);
    });

    it("reads trees cached before pages had icons, widths and owners", async () => {
        await cache.putPages("w1", [{ id: "p1", title: "A", parent_id: null, is_archived: false }] as never);
        expect(await cache.getPages("w1")).toEqual([
            {
                id: "p1",
                title: "A",
                parent_id: null,
                owner_id: "",
                visibility: "private",
                is_archived: false,
                icon: null,
                full_width: false,
                kind: "page",
                position: null,
                created_at: "",
            },
        ]);
    });

    it("keeps templates of databases (package 26)", async () => {
        const template = {
            id: "t1",
            title: "Wochentreffen",
            parent_id: "db",
            owner_id: "u1",
            visibility: "private" as const,
            is_archived: false,
            icon: null,
            full_width: false,
            kind: "page" as const,
            position: 1,
            created_at: "",
            is_template: true,
        };
        await cache.putPages("w1", [template, { ...template, id: "e1", is_template: false }]);
        expect((await cache.getPages("w1"))?.map((page) => [page.id, page.is_template])).toEqual([
            ["t1", true],
            ["e1", undefined],
        ]);
    });

    it("reads favorites from the server's embedded rows and keeps them as a flag (package 30b)", () => {
        const row = {
            id: "p1",
            title: "Reise",
            parent_id: null,
            owner_id: "u1",
            visibility: "private",
            is_archived: false,
        };
        expect(
            parseStoredPages([
                { ...row, favorites: [{ created_at: "2026-10-20T10:00:00Z" }] },
                { ...row, id: "p2", favorites: [] },
                { ...row, id: "p3", favorite: true },
            ])?.map((page) => [page.id, page.favorite]),
        ).toEqual([
            ["p1", true],
            ["p2", undefined],
            ["p3", true],
        ]);
    });

    it("keeps covers (package 30c); trees cached before have none", () => {
        const row = { id: "p1", title: "Reise", parent_id: null, is_archived: false };
        expect(
            parseStoredPages([
                { ...row, cover: "gradient:ocean" },
                { ...row, id: "p2", cover: null },
                { ...row, id: "p3" },
            ])?.map((page) => [page.id, page.cover]),
        ).toEqual([
            ["p1", "gradient:ocean"],
            ["p2", undefined],
            ["p3", undefined],
        ]);
    });

    it("keeps shared pages apart from the workspace trees", async () => {
        const shared: StoredPage = {
            id: "s1",
            title: "Geteilt",
            parent_id: "hidden",
            owner_id: "u2",
            visibility: "private",
            is_archived: false,
            icon: null,
            full_width: false,
            kind: "page",
            position: null,
            created_at: "",
        };
        await cache.putSharedPages([shared]);
        expect(await cache.getSharedPages()).toEqual([shared]);
        expect(await cache.getPages("w1")).toBeNull();
    });

    it("treats invalid cached data as missing", async () => {
        await cache.putPages("w1", [{ id: "p1" }] as never);
        expect(await cache.getPages("w1")).toBeNull();
    });
});
