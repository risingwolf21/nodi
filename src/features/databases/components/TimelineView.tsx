import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { displayTitle } from "@/features/pages/page-display";
import { cn } from "@/lib/utils";
import { addDays, localDay, timelineBars, weekDays, type DatabaseRow } from "../database-model";
import type { DatabaseProperty } from "../types";

type TimelineViewProps = {
    rows: DatabaseRow[];
    /** Undefined: the database has no date property yet. */
    dateProperty: DatabaseProperty | undefined;
    editable: boolean;
    onOpenEntry: (pageId: string) => void;
    /** New entry; undefined: entries cannot be added here. */
    onCreateEntry?: () => Promise<void>;
    onAddDateProperty: () => Promise<void>;
    onError: (message: string) => void;
};

/** Six weeks are shown; the arrows move by two. */
const SHOWN_DAYS = 42;
const STEP_DAYS = 14;
const DAY_WIDTH = 32;

const monthFormat = new Intl.DateTimeFormat("de-DE", { month: "short", year: "numeric", timeZone: "UTC" });
const rangeFormat = new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
});
const weekdayFormat = new Intl.DateTimeFormat("de-DE", { weekday: "narrow", timeZone: "UTC" });

const asDate = (day: string) => new Date(`${day}T00:00:00Z`);

/** Notion-like timeline (package 32d): entries as bars from the start to the end of a date property. */
export function TimelineView({
    rows,
    dateProperty,
    editable,
    onOpenEntry,
    onCreateEntry,
    onAddDateProperty,
    onError,
}: TimelineViewProps) {
    const today = localDay(new Date());
    // From the Monday of last week, so today is not at the very edge; only in this tab.
    const [firstDay, setFirstDay] = useState(() => addDays(weekDays(today)[0], -7));

    if (!dateProperty) {
        return (
            <div className="px-[var(--page-gutter)] py-6 text-sm text-muted-foreground">
                <p>Eine Zeitleiste ordnet Einträge nach einer Datums-Eigenschaft.</p>
                {editable && (
                    <button
                        type="button"
                        onClick={() =>
                            void onAddDateProperty().catch((err: unknown) =>
                                onError(
                                    err instanceof Error
                                        ? err.message
                                        : "Die Eigenschaft konnte nicht angelegt werden.",
                                ),
                            )
                        }
                        className="mt-2 flex h-8 items-center gap-1.5 rounded border px-2 text-foreground hover:bg-accent/60"
                    >
                        <Plus className="size-4" />
                        Datums-Eigenschaft anlegen
                    </button>
                )}
            </div>
        );
    }

    const days = Array.from({ length: SHOWN_DAYS }, (_, index) => addDays(firstDay, index));
    const bars = timelineBars(rows, dateProperty, firstDay, SHOWN_DAYS);
    const withoutDate = rows.filter((row) => !row.values[dateProperty.id]).length;
    const width = SHOWN_DAYS * DAY_WIDTH;

    return (
        <div className="px-[var(--page-gutter)] pb-4">
            <div className="mb-2 flex items-center gap-1">
                <h2 className="mr-auto text-sm font-semibold" aria-live="polite">
                    {rangeFormat.format(asDate(days[0]))} – {rangeFormat.format(asDate(days[SHOWN_DAYS - 1]))}
                </h2>
                <button
                    type="button"
                    aria-label="Früher"
                    onClick={() => setFirstDay((day) => addDays(day, -STEP_DAYS))}
                    className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-accent/60 pointer-coarse:size-9"
                >
                    <ChevronLeft className="size-4" />
                </button>
                <button
                    type="button"
                    onClick={() => setFirstDay(addDays(weekDays(today)[0], -7))}
                    className="h-7 rounded px-2 text-xs text-muted-foreground hover:bg-accent/60 pointer-coarse:h-9"
                >
                    Heute
                </button>
                <button
                    type="button"
                    aria-label="Später"
                    onClick={() => setFirstDay((day) => addDays(day, STEP_DAYS))}
                    className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-accent/60 pointer-coarse:size-9"
                >
                    <ChevronRight className="size-4" />
                </button>
            </div>

            {/* The days scroll sideways inside the view, the page does not. */}
            <section aria-label="Zeitleiste" className="overflow-x-auto rounded border">
                <div style={{ width }} className="relative text-xs">
                    <div className="flex border-b" aria-hidden="true">
                        {days.map((day) => (
                            <div
                                key={day}
                                style={{ width: DAY_WIDTH }}
                                className={cn(
                                    "shrink-0 border-r py-1 text-center text-muted-foreground",
                                    day === today && "bg-[var(--brand)]/15 font-semibold text-foreground",
                                )}
                            >
                                {day.endsWith("-01") || day === days[0] ? (
                                    <span className="block truncate px-0.5 text-[10px]">
                                        {monthFormat.format(asDate(day))}
                                    </span>
                                ) : (
                                    <span className="block text-[10px]">{weekdayFormat.format(asDate(day))}</span>
                                )}
                                {Number(day.slice(8, 10))}
                            </div>
                        ))}
                    </div>
                    <ul className="relative py-1">
                        {bars.map(({ row, first, last, startsBefore, endsAfter }) => (
                            <li key={row.page.id} className="relative h-8">
                                <button
                                    type="button"
                                    onClick={() => onOpenEntry(row.page.id)}
                                    style={{ left: first * DAY_WIDTH + 2, width: (last - first + 1) * DAY_WIDTH - 4 }}
                                    className={cn(
                                        "absolute top-1 h-6 truncate rounded border bg-background px-1.5 text-left text-xs font-medium shadow-xs hover:bg-accent/60",
                                        startsBefore && "rounded-l-none border-l-2 border-l-[var(--brand)]",
                                        endsAfter && "rounded-r-none border-r-2 border-r-[var(--brand)]",
                                        !row.page.title && "text-muted-foreground",
                                    )}
                                >
                                    {row.page.icon ? `${row.page.icon} ` : ""}
                                    {displayTitle(row.page)}
                                </button>
                            </li>
                        ))}
                        {bars.length === 0 && (
                            <li className="px-2 py-3 text-muted-foreground">Keine Einträge in diesem Zeitraum.</li>
                        )}
                    </ul>
                </div>
            </section>

            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {withoutDate > 0 && (
                    <span>
                        {withoutDate === 1 ? "1 Eintrag" : `${withoutDate} Einträge`} ohne {dateProperty.name}
                    </span>
                )}
                {editable && onCreateEntry && (
                    <button
                        type="button"
                        onClick={() => void onCreateEntry()}
                        className="flex h-7 items-center gap-1 rounded px-1 hover:bg-accent/60 pointer-coarse:h-10"
                    >
                        <Plus className="size-3.5" />
                        Neu
                    </button>
                )}
            </div>
        </div>
    );
}
