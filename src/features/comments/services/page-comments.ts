import { RemoteRequestError, toRequestError } from "@/lib/request-errors";
import { supabase } from "@/lib/supabase";
import { parseComments, type PageComment } from "../comment-threads";

type Response = { error: { message: string; code?: string } | null; status: number; data: unknown };

/** German messages for the comment errors of the server (migration 31a). */
function commentError(response: Response, fallback: string): RemoteRequestError | null {
    const failure = toRequestError(response);
    if (!failure) return null;
    console.error(fallback, failure.reason, failure.message);
    const message =
        failure.reason === "offline"
            ? "Kommentare gehen nur mit Internetverbindung."
            : response.error?.code === "42501"
              ? "Dafür fehlen dir die Rechte."
              : fallback;
    return new RemoteRequestError(failure.reason, message);
}

/** RLS filters without an error: no row back means no right. */
function requireRow(response: Response) {
    if (!Array.isArray(response.data) || response.data.length === 0) {
        throw new Error("Dafür fehlen dir die Rechte.");
    }
}

export const pageComments = {
    async list(pageId: string): Promise<PageComment[]> {
        const response = await supabase.rpc("list_page_comments", { p_page_id: pageId });
        const failure = commentError(response, "Die Kommentare konnten nicht geladen werden.");
        if (failure) throw failure;
        return parseComments(response.data);
    },

    async add(pageId: string, body: string, parentId: string | null): Promise<void> {
        const response = await supabase
            .from("page_comments")
            .insert({ page_id: pageId, parent_id: parentId, body })
            .select("id");
        const failure = commentError(response, "Der Kommentar konnte nicht gespeichert werden.");
        if (failure) throw failure;
    },

    async edit(commentId: string, body: string): Promise<void> {
        const response = await supabase.from("page_comments").update({ body }).eq("id", commentId).select("id");
        const failure = commentError(response, "Der Kommentar konnte nicht geändert werden.");
        if (failure) throw failure;
        requireRow(response);
    },

    /** The server sets the time and who resolved it. */
    async setResolved(commentId: string, resolved: boolean): Promise<void> {
        const response = await supabase
            .from("page_comments")
            .update({ resolved_at: resolved ? new Date().toISOString() : null })
            .eq("id", commentId)
            .select("id");
        const failure = commentError(response, "Der Kommentar konnte nicht geändert werden.");
        if (failure) throw failure;
        requireRow(response);
    },

    async remove(commentId: string): Promise<void> {
        const response = await supabase.from("page_comments").delete().eq("id", commentId).select("id");
        const failure = commentError(response, "Der Kommentar konnte nicht gelöscht werden.");
        if (failure) throw failure;
        requireRow(response);
    },
};
