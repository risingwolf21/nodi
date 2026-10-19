import { describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
const insert = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase", () => ({
    supabase: {
        rpc,
        from: () => ({
            insert: (row: unknown) => {
                insert(row);
                return {
                    select: () => ({
                        single: () => Promise.resolve({ data: { token: "t1" }, error: null, status: 201 }),
                    }),
                };
            },
        }),
    },
}));

const { pageSharing, parseShares, shareErrorMessage } = await import("./page-sharing");

describe("parseShares", () => {
    it("reads the rows of list_page_shares", () => {
        expect(parseShares([{ user_id: "u2", email: "a@nodi.test", permission: "edit", created_at: "x" }])).toEqual([
            { userId: "u2", email: "a@nodi.test", permission: "edit" },
        ]);
    });

    it("rejects unexpected rows instead of skipping them", () => {
        expect(() => parseShares([{ user_id: "u2", email: "a@nodi.test", permission: "owner" }])).toThrow();
        expect(() => parseShares(null)).toThrow();
    });
});

describe("shareErrorMessage", () => {
    it("explains the server's error codes in German", () => {
        expect(shareErrorMessage({ code: "P0002" }, false)).toBe("Es gibt kein Konto mit dieser E-Mail-Adresse.");
        expect(shareErrorMessage({ code: "22023" }, false)).toBe("Mit dir selbst kannst du die Seite nicht teilen.");
        expect(shareErrorMessage({ code: "42501" }, false)).toBe("Nur der Eigentümer kann diese Seite teilen.");
        expect(shareErrorMessage({ code: "" }, true)).toBe("Teilen geht nur mit Internetverbindung.");
    });
});

describe("pageSharing.share", () => {
    it("sends the e-mail and role to share_page and reports an unknown address", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        rpc.mockResolvedValueOnce({
            data: null,
            error: { message: "share_page: no account with this e-mail address", code: "P0002" },
            status: 404,
        });

        await expect(pageSharing.share("p1", "x@nodi.test", "read")).rejects.toThrow(
            "Es gibt kein Konto mit dieser E-Mail-Adresse.",
        );
        expect(rpc).toHaveBeenCalledWith("share_page", {
            p_page_id: "p1",
            p_email: "x@nodi.test",
            p_permission: "read",
        });
    });
});

describe("pageSharing.createPublicLink", () => {
    it("creates the link as the owner and returns its token", async () => {
        expect(await pageSharing.createPublicLink("p1", "u1")).toBe("t1");
        expect(insert).toHaveBeenCalledWith({ page_id: "p1", created_by: "u1" });
    });
});
