import { describe, expect, it, vi } from "vitest";
import type { StoredPage } from "../types";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

const { sharedPageTree } = await import("./useSharedPages");

const stored = (id: string, parent_id: string | null, is_archived = false): StoredPage => ({
    id,
    title: id,
    parent_id,
    owner_id: "owner", visibility: "private",
    is_archived,
    icon: null,
    full_width: false,
});

describe("sharedPageTree", () => {
    it("makes a page whose parent is not shared a root, keeps shared subpages", () => {
        const tree = sharedPageTree([stored("a", "hidden"), stored("b", "a"), stored("old", null, true)]);

        expect(tree.map(({ id, parent_id }) => ({ id, parent_id }))).toEqual([
            { id: "a", parent_id: null },
            { id: "b", parent_id: "a" },
        ]);
    });

    it("makes the subpage of an archived page a root", () => {
        const tree = sharedPageTree([stored("a", null, true), stored("b", "a")]);
        expect(tree.map(({ id, parent_id }) => ({ id, parent_id }))).toEqual([{ id: "b", parent_id: null }]);
    });
});
