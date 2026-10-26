import { supabase } from "@/lib/supabase";

// Live updates (package 36): the server records in page_activity what
// changed on a page, and Realtime sends that only to people who may read the
// page. The row has no content; whoever cares loads it as before.

export type PageChange = "page" | "document" | "properties" | "comments";

export type PageActivity = {
    pageId: string;
    workspaceId: string;
    change: PageChange;
    /** For "document": the mutation now stored on the server. */
    mutationId: string | null;
};

const CHANGES: ReadonlySet<string> = new Set<PageChange>(["page", "document", "properties", "comments"]);
const listeners = new Set<(activity: PageActivity) => void>();
const mentionListeners = new Set<() => void>();

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const isChange = (value: unknown): value is PageChange => typeof value === "string" && CHANGES.has(value);

/** A row of page_activity from Realtime; null for anything else. */
export function parsePageActivity(row: unknown): PageActivity | null {
    if (!isRecord(row)) return null;
    const { page_id: pageId, workspace_id: workspaceId, change, mutation_id: mutationId } = row;
    if (typeof pageId !== "string" || typeof workspaceId !== "string") return null;
    if (!isChange(change)) return null;
    return {
        pageId,
        workspaceId,
        change,
        mutationId: typeof mutationId === "string" ? mutationId : null,
    };
}

/** Calls the listener for every change Realtime reports; returns the unsubscribe. */
export function onPageActivity(listener: (activity: PageActivity) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function announcePageActivity(activity: PageActivity): void {
    for (const listener of listeners) listener(activity);
}

/** Calls the listener when the own mentions change (package 37); returns the unsubscribe. */
export function onMentionChange(listener: () => void): () => void {
    mentionListeners.add(listener);
    return () => mentionListeners.delete(listener);
}

/**
 * One subscription per tab while signed in (WorkspaceHome). Changes missed
 * while disconnected come with the reloads on "online" and when the app is
 * shown again, as before.
 */
export function startPageActivity(): () => void {
    const channel = supabase
        .channel("page-activity")
        .on("postgres_changes", { event: "*", schema: "public", table: "page_activity" }, (payload) => {
            const activity = parsePageActivity(payload.new);
            if (activity) announcePageActivity(activity);
        })
        // Realtime sends only the caller's own mentions on pages they may read.
        .on("postgres_changes", { event: "*", schema: "public", table: "page_mentions" }, () => {
            for (const listener of mentionListeners) listener();
        })
        .subscribe((status, error) => {
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                console.warn("Live-Aktualisierung nicht verbunden:", status, error);
            }
        });
    return () => {
        supabase.removeChannel(channel).catch((error: unknown) => {
            console.warn("Live-Aktualisierung konnte nicht beendet werden:", error);
        });
    };
}
