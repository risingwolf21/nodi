import { toRequestError } from "@/lib/request-errors";
import { supabase } from "@/lib/supabase";
import { parseRecurrence, type EntryRecurrence } from "../recurrence";

// Small on purpose: the page tree calls createDueRecurringEntries, and the
// database code stays in its own chunk.

const COLUMNS =
    "pageId:page_id,frequency,interval,weekdays,startDate:start_date,nextDate:next_date,datePropertyId:date_property_id";

/** Creates the copies of recurring entries that are due in a workspace (package 25); how many. */
export async function createDueRecurringEntries(workspaceId: string): Promise<number> {
    const response = await supabase.rpc("create_due_recurring_entries", { p_workspace_id: workspaceId });
    const failure = toRequestError(response);
    if (failure) throw failure;
    return typeof response.data === "number" ? response.data : 0;
}

export type RecurrenceRule = Omit<EntryRecurrence, "nextDate">;

export const recurrenceRepository = {
    async get(pageId: string): Promise<EntryRecurrence | null> {
        const response = await supabase.from("entry_recurrences").select(COLUMNS).eq("page_id", pageId);
        const failure = toRequestError(response);
        if (failure) throw failure;
        return parseRecurrence(response.data?.[0] ?? null);
    },

    /** Sets up or changes the rule; the server computes the next day. */
    async save(rule: RecurrenceRule): Promise<EntryRecurrence> {
        const response = await supabase
            .from("entry_recurrences")
            .upsert({
                page_id: rule.pageId,
                frequency: rule.frequency,
                interval: rule.interval,
                weekdays: rule.weekdays,
                start_date: rule.startDate,
                date_property_id: rule.datePropertyId,
            })
            .select(COLUMNS);
        const failure = toRequestError(response);
        if (failure) throw failure;
        const saved = parseRecurrence(response.data?.[0] ?? null);
        if (!saved) throw new Error("Die Wiederholung konnte nicht gespeichert werden.");
        return saved;
    },

    async remove(pageId: string): Promise<void> {
        const response = await supabase.from("entry_recurrences").delete().eq("page_id", pageId);
        const failure = toRequestError(response);
        if (failure) throw failure;
    },
};
