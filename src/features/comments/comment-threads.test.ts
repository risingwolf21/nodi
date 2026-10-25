import { describe, expect, it } from "vitest";
import { groupThreads, parseComments } from "./comment-threads";

const row = (id: string, parentId: string | null, createdAt: string) => ({
    id,
    parent_id: parentId,
    author_id: "u1",
    author_email: "kim@nodi.test",
    body: `Text ${id}`,
    created_at: createdAt,
    edited_at: null,
    resolved_at: null,
});

describe("comments", () => {
    it("groups replies under their thread, threads and replies oldest first", () => {
        const comments = parseComments([
            row("r2", "t1", "2026-10-20T10:05:00Z"),
            row("t2", null, "2026-10-20T10:03:00Z"),
            row("t1", null, "2026-10-20T10:00:00Z"),
            row("r1", "t1", "2026-10-20T10:01:00Z"),
            // Its thread is not there (not readable any more): left out.
            row("r3", "gone", "2026-10-20T10:06:00Z"),
        ]);
        expect(groupThreads(comments).map(({ root, replies }) => [root.id, replies.map((reply) => reply.id)])).toEqual([
            ["t1", ["r1", "r2"]],
            ["t2", []],
        ]);
    });

    it("reads the quote of a thread on text (package 31b)", () => {
        const [onText, onPage] = parseComments([
            { ...row("t1", null, "2026-10-20T10:00:00Z"), quote: "am Freitag" },
            row("t2", null, "2026-10-20T10:01:00Z"),
        ]);
        expect([onText.quote, onPage.quote]).toEqual(["am Freitag", null]);
    });

    it("rejects broken rows", () => {
        expect(() => parseComments([{ id: "x" }])).toThrow();
        expect(() => parseComments(null)).toThrow();
    });
});
