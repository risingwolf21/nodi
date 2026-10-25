import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { displayTitle } from "@/features/pages/page-display";
import { cn } from "@/lib/utils";
import {
    addDays,
    dayOf,
    isDateValue,
    localDay,
    monthGrid,
    moveDate,
    rowsByDay,
    timeOfDay,
    weekDays,
    type DatabaseRow,
} from "../database-model";
import type { DatabaseProperty, DateValue } from "../types";

type CalendarViewProps = {
    rows: DatabaseRow[];
    /** Undefined: the database has no date property yet. */
    dateProperty: DatabaseProperty | undefined;
    editable: boolean;
    onOpenEntry: (pageId: string) => void;
    /** New entry on a day ("YYYY-MM-DD"); undefined: entries cannot be added here. */
    onCreateEntry?: (day: string) => Promise<void>;
    /** A dragged entry gets a new date (package 32b). */
    onMoveEntry: (pageId: string, value: DateValue) => Promise<void>;
    onAddDateProperty: () => Promise<void>;
    onError: (message: string) => void;
};

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const monthFormat = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" });
const dayLabelFormat = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", timeZone: "UTC" });
const weekLabelFormat = new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
});

type CalendarMode = "month" | "week";

/** The month of a "YYYY-MM-DD" day, month counted from 0. */
function monthOf(day: string) {
    return { year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) - 1 };
}

/** Notion-like calendar (month or week): entries on the days of a date property; dragging moves them. */
export function CalendarView({
    rows,
    dateProperty,
    editable,
    onOpenEntry,
    onCreateEntry,
    onMoveEntry,
    onAddDateProperty,
    onError,
}: CalendarViewProps) {
    const today = localDay(new Date());
    // The shown month or week, by one of its days; like the month, only in this tab.
    const [anchor, setAnchor] = useState(today);
    const [mode, setMode] = useState<CalendarMode>("month");
    const dragged = useRef<{ pageId: string; fromDay: string } | null>(null);
    const [dropDay, setDropDay] = useState("");

    if (!dateProperty) {
        return (
            <div className="px-[var(--page-gutter)] py-6 text-sm text-muted-foreground">
                <p>Ein Kalender ordnet Einträge nach einer Datums-Eigenschaft.</p>
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

    const property = dateProperty;
    const month = monthOf(anchor);
    const week = weekDays(anchor);
    const weeks = mode === "month" ? monthGrid(month.year, month.month) : [week];
    const byDay = rowsByDay(rows, property);
    const shift = (delta: number) =>
        setAnchor((current) => {
            if (mode === "week") return addDays(current, delta * 7);
            const { year, month } = monthOf(current);
            return new Date(Date.UTC(year, month + delta, 1)).toISOString().slice(0, 10);
        });
    const inMonth = (day: string) => mode === "week" || monthOf(day).month === month.month;
    const title =
        mode === "month"
            ? monthFormat.format(new Date(Date.UTC(month.year, month.month, 1)))
            : `${weekLabelFormat.format(new Date(`${week[0]}T00:00:00Z`))} – ${weekLabelFormat.format(new Date(`${week[6]}T00:00:00Z`))}`;
    const canMove = editable;

    function drop(day: string) {
        setDropDay("");
        const entry = dragged.current;
        dragged.current = null;
        if (!entry || entry.fromDay === day) return;
        const value = rows.find((row) => row.page.id === entry.pageId)?.values[property.id];
        if (!isDateValue(value)) return;
        onMoveEntry(entry.pageId, moveDate(value, entry.fromDay, day)).catch((err: unknown) =>
            onError(err instanceof Error ? err.message : "Der Eintrag konnte nicht verschoben werden."),
        );
    }

    return (
        <div className="px-[var(--page-gutter)] pb-4">
            <div className="mb-2 flex items-center gap-1">
                <h2 className="mr-auto text-sm font-semibold" aria-live="polite">
                    {title}
                </h2>
                <div className="mr-1 flex rounded border p-0.5" role="group" aria-label="Zeitraum">
                    {(["month", "week"] as const).map((item) => (
                        <button
                            key={item}
                            type="button"
                            aria-pressed={mode === item}
                            onClick={() => setMode(item)}
                            className={cn(
                                "h-6 rounded px-2 text-xs text-muted-foreground hover:bg-accent/60 pointer-coarse:h-8",
                                mode === item && "bg-accent text-foreground",
                            )}
                        >
                            {item === "month" ? "Monat" : "Woche"}
                        </button>
                    ))}
                </div>
                <button
                    type="button"
                    aria-label={mode === "month" ? "Vorheriger Monat" : "Vorherige Woche"}
                    onClick={() => shift(-1)}
                    className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-accent/60 pointer-coarse:size-9"
                >
                    <ChevronLeft className="size-4" />
                </button>
                <button
                    type="button"
                    onClick={() => setAnchor(today)}
                    className="h-7 rounded px-2 text-xs text-muted-foreground hover:bg-accent/60 pointer-coarse:h-9"
                >
                    Heute
                </button>
                <button
                    type="button"
                    aria-label={mode === "month" ? "Nächster Monat" : "Nächste Woche"}
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
                            onDragOver={(event) => {
                                if (!dragged.current) return;
                                event.preventDefault();
                                setDropDay(day);
                            }}
                            onDragLeave={() => setDropDay((current) => (current === day ? "" : current))}
                            onDrop={(event) => {
                                event.preventDefault();
                                drop(day);
                            }}
                            className={cn(
                                "group/day flex min-w-0 flex-col gap-0.5 border-r border-b p-1",
                                mode === "week" ? "min-h-64" : "min-h-24",
                                !inMonth(day) && "bg-muted/40 text-muted-foreground",
                                dropDay === day && "ring-2 ring-inset ring-[var(--brand)]/60",
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
                            {dayRows.map((row) => {
                                const value = row.values[property.id];
                                // The time belongs to the first day of a range.
                                const time =
                                    isDateValue(value) && dayOf(value.start) === day ? timeOfDay(value.start) : null;
                                return (
                                    <button
                                        key={row.page.id}
                                        type="button"
                                        draggable={canMove}
                                        onDragStart={(event) => {
                                            dragged.current = { pageId: row.page.id, fromDay: day };
                                            event.dataTransfer.effectAllowed = "move";
                                            // Firefox only starts a drag that carries data.
                                            event.dataTransfer.setData("text/plain", displayTitle(row.page));
                                        }}
                                        onDragEnd={() => {
                                            dragged.current = null;
                                            setDropDay("");
                                        }}
                                        onClick={() => onOpenEntry(row.page.id)}
                                        className={cn(
                                            "truncate rounded border bg-background px-1 py-0.5 text-left font-medium text-foreground shadow-xs hover:bg-accent/60",
                                            !row.page.title && "text-muted-foreground",
                                        )}
                                    >
                                        {time && (
                                            <span className="font-normal text-muted-foreground tabular-nums">
                                                {time}{" "}
                                            </span>
                                        )}
                                        {row.page.icon ? `${row.page.icon} ` : ""}
                                        {displayTitle(row.page)}
                                    </button>
                                );
                            })}
                        </div>
                    );
                })}
            </section>
        </div>
    );
}
