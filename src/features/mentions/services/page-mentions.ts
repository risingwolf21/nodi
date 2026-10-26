import { RemoteRequestError, toRequestError } from "@/lib/request-errors";
import { supabase } from "@/lib/supabase";
import { parseMentions, type Mention } from "../mentions";

// The newest mentions; older ones are not shown (like Notion's inbox).
const SHOWN_MENTIONS = 50;

type Response = { error: { message: string; code?: string } | null; status: number; data: unknown };

function mentionError(response: Response, fallback: string): RemoteRequestError | null {
    const failure = toRequestError(response);
    if (!failure) return null;
    console.error(fallback, failure.reason, failure.message);
    return new RemoteRequestError(
        failure.reason,
        failure.reason === "offline" ? "Erwähnungen gehen nur mit Internetverbindung." : fallback,
    );
}

export const pageMentions = {
    async list(): Promise<Mention[]> {
        const response = await supabase.rpc("list_my_mentions", { p_limit: SHOWN_MENTIONS });
        const failure = mentionError(response, "Die Erwähnungen konnten nicht geladen werden.");
        if (failure) throw failure;
        return parseMentions(response.data);
    },

    /** RLS lets only the mentioned person change read_at of their rows. */
    async markRead(mentionId: string): Promise<void> {
        const response = await supabase
            .from("page_mentions")
            .update({ read_at: new Date().toISOString() })
            .eq("id", mentionId)
            .is("read_at", null);
        const failure = mentionError(response, "Die Erwähnung konnte nicht als gelesen markiert werden.");
        if (failure) throw failure;
    },

    async markAllRead(): Promise<void> {
        const response = await supabase
            .from("page_mentions")
            .update({ read_at: new Date().toISOString() })
            .is("read_at", null);
        const failure = mentionError(response, "Die Erwähnungen konnten nicht als gelesen markiert werden.");
        if (failure) throw failure;
    },
};
