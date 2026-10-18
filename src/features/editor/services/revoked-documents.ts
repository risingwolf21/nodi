import { hasAccountSession } from "@/lib/account-session";
import { toRequestError } from "@/lib/request-errors";
import { supabase } from "@/lib/supabase";
import type { LocalDocumentStore } from "./local-document-store";

/**
 * Deletes local copies of pages the server no longer lets the user read,
 * e.g. after a share was revoked (CLAUDE.md §12, package 11). RLS decides:
 * every page the user can read is returned. Without a complete answer
 * nothing is deleted, so a lost request or a truncated list cannot remove
 * readable pages. Returns the ids of the deleted copies.
 */
export async function deleteRevokedLocalCopies(
    userId: string,
    store: LocalDocumentStore,
): Promise<string[]> {
    if (!(await hasAccountSession(userId))) return [];

    const response = await supabase.from("pages").select("id", { count: "exact" });

    const failure = toRequestError(response);
    if (failure) {
        // Offline or a server error: try again on the next contact.
        console.warn("Lesbare Seiten konnten nicht geprüft werden:", failure.reason, failure.message);
        return [];
    }

    const rows: unknown[] = response.data ?? [];
    const readableIds = rows.flatMap((row) =>
        typeof row === "object" && row !== null && "id" in row && typeof row.id === "string"
            ? [row.id]
            : [],
    );
    if (response.count === null || readableIds.length !== response.count) {
        console.warn("Liste der lesbaren Seiten ist unvollständig; lokale Kopien bleiben.");
        return [];
    }

    return store.deleteSyncedExcept(new Set(readableIds));
}
