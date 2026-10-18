import { RemoteRequestError, toRequestError } from "@/lib/request-errors";
import { supabase } from "@/lib/supabase";

export type SharePermission = "read" | "edit";

export type PageShare = {
    userId: string;
    email: string;
    permission: SharePermission;
};

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isPermission(value: unknown): value is SharePermission {
    return value === "read" || value === "edit";
}

/** Rows of `list_page_shares`; an invalid row is an error, not skipped. */
export function parseShares(value: unknown): PageShare[] {
    if (!Array.isArray(value)) throw new Error("Unerwartete Antwort beim Laden der Freigaben.");

    return value.map((row) => {
        if (
            !isObject(row) ||
            typeof row.user_id !== "string" ||
            typeof row.email !== "string" ||
            !isPermission(row.permission)
        ) {
            throw new Error("Unerwartete Antwort beim Laden der Freigaben.");
        }
        return { userId: row.user_id, email: row.email, permission: row.permission };
    });
}

type ResponseError = { message: string; code?: string } | null;

/** German message for errors of `share_page` (codes see the migration). */
export function shareErrorMessage(error: { code?: string }, offline: boolean): string {
    if (offline) return "Teilen geht nur mit Internetverbindung.";
    switch (error.code) {
        case "P0002":
            return "Es gibt kein Konto mit dieser E-Mail-Adresse.";
        case "22023":
            return "Mit dir selbst kannst du die Seite nicht teilen.";
        case "42501":
            return "Nur der Eigentümer kann diese Seite teilen.";
        default:
            return "Die Seite konnte nicht geteilt werden.";
    }
}

function failure(
    response: { error: ResponseError; status: number },
    message: (offline: boolean) => string,
): RemoteRequestError | null {
    const error = toRequestError(response);
    if (!error) return null;
    console.error("Freigabe fehlgeschlagen:", error.reason, error.message);
    return new RemoteRequestError(error.reason, message(error.reason === "offline"));
}

/**
 * Sharing a page (owner only, enforced by the server, CLAUDE.md §12
 * package 11a). Changing the role shares again with the same address.
 */
export const pageSharing = {
    async list(pageId: string): Promise<PageShare[]> {
        const response = await supabase.rpc("list_page_shares", { p_page_id: pageId });
        const error = failure(response, (offline) =>
            offline
                ? "Freigaben können nur mit Internetverbindung geladen werden."
                : "Die Freigaben konnten nicht geladen werden.",
        );
        if (error) throw error;
        return parseShares(response.data);
    },

    async share(pageId: string, email: string, permission: SharePermission): Promise<void> {
        const response = await supabase.rpc("share_page", {
            p_page_id: pageId,
            p_email: email,
            p_permission: permission,
        });
        const error = failure(response, (offline) =>
            shareErrorMessage(response.error ?? {}, offline),
        );
        if (error) throw error;
    },

    async revoke(pageId: string, userId: string): Promise<void> {
        const response = await supabase
            .from("page_shares")
            .delete()
            .eq("page_id", pageId)
            .eq("shared_with_user_id", userId);
        const error = failure(response, (offline) =>
            offline
                ? "Der Zugriff kann nur mit Internetverbindung entzogen werden."
                : "Der Zugriff konnte nicht entzogen werden.",
        );
        if (error) throw error;
    },
};
