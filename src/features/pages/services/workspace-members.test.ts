import { describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

const { memberErrorMessage, parseMembers, workspaceMembers } = await import("./workspace-members");

describe("parseMembers", () => {
    it("reads the rows of list_workspace_members", () => {
        expect(parseMembers([{ user_id: "u1", email: "a@nodi.test", role: "owner", joined_at: "x" }])).toEqual([
            { userId: "u1", email: "a@nodi.test", role: "owner" },
        ]);
    });

    it("rejects unexpected rows instead of skipping them", () => {
        expect(() => parseMembers([{ user_id: "u1", email: "a@nodi.test", role: "guest" }])).toThrow();
        expect(() => parseMembers(null)).toThrow();
    });
});

describe("memberErrorMessage", () => {
    it("explains the server's error codes in German", () => {
        expect(memberErrorMessage("add", "P0002", false)).toBe("Es gibt kein Konto mit dieser E-Mail-Adresse.");
        expect(memberErrorMessage("leave", "22023", false)).toBe("Als Owner kannst du den Workspace nicht verlassen.");
        expect(memberErrorMessage("remove", "42501", false)).toBe(
            "Nur der Owner des Workspace kann Mitglieder verwalten.",
        );
        expect(memberErrorMessage("add", "", true)).toBe(
            "Mitglieder lassen sich nur mit Internetverbindung verwalten.",
        );
    });
});

describe("workspaceMembers.add", () => {
    it("sends the e-mail to add_workspace_member and reports an unknown address", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        rpc.mockResolvedValueOnce({
            data: null,
            error: { message: "add_workspace_member: no account with this e-mail address", code: "P0002" },
            status: 404,
        });

        await expect(workspaceMembers.add("w1", "x@nodi.test")).rejects.toThrow(
            "Es gibt kein Konto mit dieser E-Mail-Adresse.",
        );
        expect(rpc).toHaveBeenCalledWith("add_workspace_member", { p_workspace_id: "w1", p_email: "x@nodi.test" });
    });
});
