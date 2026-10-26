import { describe, expect, it, vi } from "vitest";
import { announcePageActivity, onPageActivity, parsePageActivity } from "./page-activity";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

const row = {
    page_id: "b0000000-0000-4000-8000-000000000001",
    workspace_id: "a0000000-0000-4000-8000-000000000001",
    change: "document",
    actor: "11111111-1111-4111-8111-111111111111",
    mutation_id: "0a000000-0000-4000-8000-000000000001",
    changed_at: "2026-10-26T09:00:00Z",
};

describe("parsePageActivity", () => {
    it("reads a row of page_activity", () => {
        expect(parsePageActivity(row)).toEqual({
            pageId: row.page_id,
            workspaceId: row.workspace_id,
            change: "document",
            mutationId: row.mutation_id,
        });
        expect(parsePageActivity({ ...row, change: "page", mutation_id: null })?.mutationId).toBeNull();
    });

    it("rejects anything else", () => {
        expect(parsePageActivity(null)).toBeNull();
        expect(parsePageActivity({})).toBeNull();
        expect(parsePageActivity({ ...row, change: "everything" })).toBeNull();
        expect(parsePageActivity({ ...row, page_id: 1 })).toBeNull();
    });
});

describe("onPageActivity", () => {
    it("calls listeners until they unsubscribe", () => {
        const listener = vi.fn();
        const stop = onPageActivity(listener);
        const activity = parsePageActivity(row)!;
        announcePageActivity(activity);
        stop();
        announcePageActivity(activity);
        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith(activity);
    });
});
