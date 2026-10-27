import { describe, expect, it } from "vitest";
import { parseMentions, personName } from "./mentions";

describe("parseMentions", () => {
    it("reads the rows of list_my_mentions", () => {
        expect(
            parseMentions([
                {
                    id: "m1",
                    page_id: "p1",
                    workspace_id: "w1",
                    page_title: "Plan",
                    page_icon: null,
                    mentioned_by_email: "anna@nodi.test",
                    mentioned_at: "2026-10-26T09:00:00Z",
                    read_at: null,
                },
            ]),
        ).toEqual([
            {
                id: "m1",
                pageId: "p1",
                workspaceId: "w1",
                pageTitle: "Plan",
                pageIcon: null,
                mentionedBy: "anna@nodi.test",
                mentionedAt: "2026-10-26T09:00:00Z",
                readAt: null,
            },
        ]);
    });

    it("rejects an invalid answer", () => {
        expect(() => parseMentions(null)).toThrow();
        expect(() => parseMentions([{ id: "m1" }])).toThrow();
    });
});

describe("personName", () => {
    it("shows the part before the @", () => {
        expect(personName("anna@nodi.test")).toBe("anna");
        expect(personName("ohne-at")).toBe("ohne-at");
    });
});
