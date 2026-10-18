import { RemoteRequestError, toRequestError } from "@/lib/request-errors";
import { supabase } from "@/lib/supabase";

export type WorkspaceRole = "owner" | "admin" | "member";

export type WorkspaceMember = {
    userId: string;
    email: string;
    role: WorkspaceRole;
};

const ROLES: readonly string[] = ["owner", "admin", "member"];

function isRole(value: unknown): value is WorkspaceRole {
    return typeof value === "string" && ROLES.includes(value);
}

/** Rows of `list_workspace_members`; an invalid row is an error, not skipped. */
export function parseMembers(value: unknown): WorkspaceMember[] {
    if (!Array.isArray(value)) throw new Error("Unerwartete Antwort beim Laden der Mitglieder.");

    return value.map((row: unknown) => {
        if (
            typeof row !== "object" ||
            row === null ||
            !("user_id" in row) ||
            typeof row.user_id !== "string" ||
            !("email" in row) ||
            typeof row.email !== "string" ||
            !("role" in row) ||
            !isRole(row.role)
        ) {
            throw new Error("Unerwartete Antwort beim Laden der Mitglieder.");
        }
        return { userId: row.user_id, email: row.email, role: row.role };
    });
}

/** German message for the error codes of the member RPCs (see migration 12a). */
export function memberErrorMessage(
    action: "list" | "add" | "remove" | "leave",
    code: string | undefined,
    offline: boolean,
): string {
    if (offline) return "Mitglieder lassen sich nur mit Internetverbindung verwalten.";
    if (action === "add" && code === "P0002") return "Es gibt kein Konto mit dieser E-Mail-Adresse.";
    if (action === "add" && code === "22023") return "Du bist bereits Mitglied dieses Workspace.";
    if (action === "leave" && code === "22023") return "Als Owner kannst du den Workspace nicht verlassen.";
    if (code === "42501") return "Nur der Owner des Workspace kann Mitglieder verwalten.";
    switch (action) {
        case "list":
            return "Die Mitglieder konnten nicht geladen werden.";
        case "add":
            return "Die Person konnte nicht hinzugefügt werden.";
        case "remove":
            return "Die Person konnte nicht entfernt werden.";
        case "leave":
            return "Du konntest den Workspace nicht verlassen.";
    }
}

async function call(
    action: Parameters<typeof memberErrorMessage>[0],
    request: PromiseLike<{ data: unknown; error: { message: string; code?: string } | null; status: number }>,
): Promise<unknown> {
    const response = await request;
    const error = toRequestError(response);
    if (error) {
        console.error("Mitgliederverwaltung fehlgeschlagen:", action, error.reason, error.message);
        throw new RemoteRequestError(
            error.reason,
            memberErrorMessage(action, response.error?.code, error.reason === "offline"),
        );
    }
    return response.data;
}

/**
 * Members of a workspace (RPCs of package 12a). Only the owner adds and
 * removes; the server checks it. Removing and leaving hand the person's
 * shared pages to the owner.
 */
export const workspaceMembers = {
    async list(workspaceId: string): Promise<WorkspaceMember[]> {
        return parseMembers(
            await call("list", supabase.rpc("list_workspace_members", { p_workspace_id: workspaceId })),
        );
    },

    async add(workspaceId: string, email: string): Promise<void> {
        await call("add", supabase.rpc("add_workspace_member", { p_workspace_id: workspaceId, p_email: email }));
    },

    async remove(workspaceId: string, userId: string): Promise<void> {
        await call(
            "remove",
            supabase.rpc("remove_workspace_member", { p_workspace_id: workspaceId, p_user_id: userId }),
        );
    },

    async leave(workspaceId: string): Promise<void> {
        await call("leave", supabase.rpc("leave_workspace", { p_workspace_id: workspaceId }));
    },
};
