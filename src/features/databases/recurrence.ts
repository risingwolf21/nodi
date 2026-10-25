// Recurring entries (package 25): the rule of an entry and how it reads.
// The copies are made by the server (create_due_recurring_entries).

export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";

export type EntryRecurrence = {
    pageId: string;
    frequency: RecurrenceFrequency;
    /** Every n days, weeks, months or years. */
    interval: number;
    /** Weekly: 1 = Monday … 7 = Sunday; empty: the start's weekday. */
    weekdays: number[];
    /** "YYYY-MM-DD". */
    startDate: string;
    /** The next copy's day ("YYYY-MM-DD"), set by the server. */
    nextDate: string;
    /** The date property that gets the copy's day, if any. */
    datePropertyId: string | null;
};

export const RECURRENCE_FREQUENCIES: readonly RecurrenceFrequency[] = ["daily", "weekly", "monthly", "yearly"];

export const FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
    daily: "Täglich",
    weekly: "Wöchentlich",
    monthly: "Monatlich",
    yearly: "Jährlich",
};

export const WEEKDAY_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isFrequency = (value: unknown): value is RecurrenceFrequency =>
    typeof value === "string" && (RECURRENCE_FREQUENCIES as readonly string[]).includes(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

/** A row of `entry_recurrences` (aliased to the app's names); null if it is not one. */
export function parseRecurrence(value: unknown): EntryRecurrence | null {
    if (
        !isRecord(value) ||
        typeof value.pageId !== "string" ||
        !isFrequency(value.frequency) ||
        typeof value.interval !== "number" ||
        !Array.isArray(value.weekdays) ||
        typeof value.startDate !== "string" ||
        !DAY.test(value.startDate) ||
        typeof value.nextDate !== "string"
    ) {
        return null;
    }
    return {
        pageId: value.pageId,
        frequency: value.frequency,
        interval: value.interval,
        weekdays: value.weekdays.filter((day): day is number => typeof day === "number" && day >= 1 && day <= 7),
        startDate: value.startDate,
        nextDate: value.nextDate,
        datePropertyId: typeof value.datePropertyId === "string" ? value.datePropertyId : null,
    };
}

const UNITS: Record<RecurrenceFrequency, [string, string]> = {
    daily: ["Tag", "Tage"],
    weekly: ["Woche", "Wochen"],
    monthly: ["Monat", "Monate"],
    yearly: ["Jahr", "Jahre"],
};

/** The 1-based weekday (Monday = 1) of a "YYYY-MM-DD" day. */
export function weekdayOf(day: string): number {
    const [year, month, date] = day.split("-").map(Number);
    return ((new Date(year, month - 1, date).getDay() + 6) % 7) + 1;
}

/** "Wöchentlich am Mo, Mi", "Alle 2 Tage", "Monatlich am 31." */
export function describeRecurrence(rule: Pick<EntryRecurrence, "frequency" | "interval" | "weekdays" | "startDate">) {
    const base =
        rule.interval === 1 ? FREQUENCY_LABELS[rule.frequency] : `Alle ${rule.interval} ${UNITS[rule.frequency][1]}`;
    if (rule.frequency === "weekly") {
        const days = rule.weekdays.length > 0 ? rule.weekdays : [weekdayOf(rule.startDate)];
        return `${base} am ${[...days]
            .sort((a, b) => a - b)
            .map((day) => WEEKDAY_SHORT[day - 1])
            .join(", ")}`;
    }
    if (rule.frequency === "monthly") return `${base} am ${Number(rule.startDate.slice(8))}.`;
    return base;
}
