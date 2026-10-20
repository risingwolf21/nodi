import { toRequestError } from "@/lib/request-errors";
import { supabase } from "@/lib/supabase";

/** The ids of readable pages whose text links the page (RPC page_backlinks, package 28). */
export async function loadBacklinks(pageId: string): Promise<string[]> {
    const response = await supabase.rpc("page_backlinks", { p_page_id: pageId });
    const failure = toRequestError(response);
    if (failure) throw failure;
    const rows: unknown[] = Array.isArray(response.data) ? response.data : [];
    return rows.flatMap((row) =>
        typeof row === "object" && row !== null && "id" in row && typeof row.id === "string" ? [row.id] : [],
    );
}
