import { toRequestError } from "@/lib/request-errors";
import { supabase } from "@/lib/supabase";

/**
 * The workspace of a page outside the trash, for opening it by its link
 * (package 46); null when there is none the user may read (RLS decides).
 */
export async function pageWorkspaceId(pageId: string): Promise<string | null> {
    const response = await supabase
        .from("pages")
        .select("workspace_id")
        .eq("id", pageId)
        .eq("is_archived", false)
        .maybeSingle();
    const failure = toRequestError(response);
    if (failure) throw failure;
    const workspaceId: unknown = response.data?.workspace_id;
    return typeof workspaceId === "string" ? workspaceId : null;
}
