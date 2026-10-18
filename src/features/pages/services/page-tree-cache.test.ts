import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { PageTreeCache } from "./page-tree-cache";

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
        await cache.putPages("w1", [{ id: "p1", title: "A", parent_id: null, is_archived: false, icon: "📘", full_width: true }]);
        await cache.putPages("w2", [{ id: "p2", title: "B", parent_id: null, is_archived: true, icon: null, full_width: false }]);

        expect(await cache.getWorkspaces()).toEqual([{ id: "w1", name: "Persönlich" }]);
        expect(await cache.getPages("w1")).toEqual([
            { id: "p1", title: "A", parent_id: null, is_archived: false, icon: "📘", full_width: true },
        ]);
    });

    it("reads trees cached before pages had icons and widths", async () => {
        await cache.putPages("w1", [{ id: "p1", title: "A", parent_id: null, is_archived: false }] as never);
        expect(await cache.getPages("w1")).toEqual([
            { id: "p1", title: "A", parent_id: null, is_archived: false, icon: null, full_width: false },
        ]);
    });

    it("treats invalid cached data as missing", async () => {
        await cache.putPages("w1", [{ id: "p1" }] as never);
        expect(await cache.getPages("w1")).toBeNull();
    });
});
