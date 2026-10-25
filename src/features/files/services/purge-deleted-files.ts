import { supabase } from "@/lib/supabase";

/**
 * Asks the server to delete the files of pages deleted for good (Edge
 * Function purge-deleted-files, package 35). Only a nudge: the queue stays
 * on the server, so what fails here is done by the next call or the daily run.
 */
export function requestDeletedFilesCleanup(): void {
    supabase.functions.invoke("purge-deleted-files", { method: "POST" }).then(
        ({ error }) => {
            if (error) console.error("Dateien gelöschter Seiten wurden nicht entfernt:", error);
        },
        (error: unknown) => console.error("Dateien gelöschter Seiten wurden nicht entfernt:", error),
    );
}
