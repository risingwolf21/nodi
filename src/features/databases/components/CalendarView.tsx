import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { displayTitle } from "@/features/pages/page-display";
import { cn } from "@/lib/utils";
import { localDay, monthGrid, rowsByDay, type DatabaseRow } from "../database-model";
import type { DatabaseProperty } from "../types";

type CalendarViewProps = {
    rows: DatabaseRow[];
    /** Undefined: the database has no date property yet. */
    dateProperty: DatabaseProperty | undefined;
    editable: boolean;
    onOpenEntry: (pageId: string) => void;
    /** New entry on a day ("YYYY-MM-DD"); undefined: entries cannot be added here. */
    onCreateEntry?: (day: string) => Promise<void>;
    onAddDateProperty: () => Promise<void>;
    onError: (message: string) => void;
};

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const monthFormat = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" });
const dayLabelFormat = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", timeZone: "UTC" });

/** The month of a "YYYY-MM-DD" day, month counted from 0. */
function monthOf(day: string) {
    return { year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) - 1 };
}

/** Notion-like month calendar: entries on the days of a date property. */
export function CalendarView({
    rows,
    dateProperty,
    editable,
    onOpenEntry,
    onCreateEntry,
    onAddDateProperty,
    onError,
}: CalendarViewProps) {
    const today = localDay(new Date());
    const [month, setMonth] = useState(() => monthOf(today));

    if (!dateProperty) {
        return (
            <div className="px-[var(--page-gutter)] py-6 text-sm text-muted-foreground">
                <p>Ein Kalender ordnet Einträge nach einer Datums-Eigenschaft.</p>
                {editable && (
                    <button
                        type="button"
                        onClick={() =>
                            onAddDateProperty().catch((err: unknown) =>
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

    const weeks = monthGrid(month.year, month.month);
    const byDay = rowsByDay(rows, dateProperty);
    const shift = (delta: number) =>
        setMonth((current) => {
            const next = new Date(Date.UTC(current.year, current.month + delta, 1));
            return { year: next.getUTCFullYear(), month: next.getUTCMonth() };
        });
    const inMonth = (day: string) => monthOf(day).month === month.month;

    return (
        <div className="px-[var(--page-gutter)] pb-4">
            <div className="mb-2 flex items-center gap-1">
                <h2 className="mr-auto text-sm font-semibold" aria-live="polite">
                    {monthFormat.format(new Date(Date.UTC(month.year, month.month, 1)))}
                </h2>
                <button
                    type="button"
                    aria-label="Vorheriger Monat"
                    onClick={() => shift(-1)}
                    className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-accent/60 pointer-coarse:size-9"
                >
                    <ChevronLeft className="size-4" />
                </button>
                <button
                    type="button"
                    onClick={() => setMonth(monthOf(today))}
                    className="h-7 rounded px-2 text-xs text-muted-foreground hover:bg-accent/60 pointer-coarse:h-9"
                >
                    Heute
                </button>
                <button
                    type="button"
                    aria-label="Nächster Monat"
                    onClick={() => shift(1)}
                    className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-accent/60 pointer-coarse:size-9"
                >
                    <ChevronRight className="size-4" />
                </button>
            </div>
            <section className="grid grid-cols-7 border-t border-l text-xs" aria-label="Kalender">
                {WEEKDAYS.map((weekday) => (
                    <div
                        key={weekday}
                        aria-hidden="true"
                        className="border-r border-b px-1.5 py-1 text-muted-foreground"
                    >
                        {weekday}
                    </div>
                ))}
                {weeks.flat().map((day) => {
                    const dayRows = byDay.get(day) ?? [];
                    const label = dayLabelFormat.format(new Date(`${day}T00:00:00Z`));
                    return (
                        <div
                            key={day}
                            role="group"
                            aria-label={label}
                            className={cn(
                                "group/day flex min-h-24 min-w-0 flex-col gap-0.5 border-r border-b p-1",
                                !inMonth(day) && "bg-muted/40 text-muted-foreground",
                            )}
                        >
                            <div className="flex h-5 items-center justify-between">
                                <span
                                    className={cn(
                                        "flex size-5 items-center justify-center rounded-full",
                                        day === today && "bg-[var(--brand)] font-semibold text-white",
                                    )}
                                >
                                    {Number(day.slice(8, 10))}
                                </span>
                                {editable && onCreateEntry && (
                                    <button
                                        type="button"
                                        aria-label={`Neuer Eintrag am ${label}`}
                                        onClick={() => void onCreateEntry(day)}
                                        className="flex size-5 items-center justify-center rounded text-muted-foreground opacity-0 group-hover/day:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 hover:bg-accent"
                                    >
                                        <Plus className="size-3.5" />
                                    </button>
                                )}
                            </div>
                            {dayRows.map((row) => (
                                <button
                                    key={row.page.id}
                                    type="button"
                                    onClick={() => onOpenEntry(row.page.id)}
                                    className={cn(
                                        "truncate rounded border bg-background px-1 py-0.5 text-left font-medium text-foreground shadow-xs hover:bg-accent/60",
                                        !row.page.title && "text-muted-foreground",
                                    )}
                                >
                                    {row.page.icon ? `${row.page.icon} ` : ""}
                                    {displayTitle(row.page)}
                                </button>
                            ))}
                        </div>
                    );
                })}
            </section>
        </div>
    );
}
