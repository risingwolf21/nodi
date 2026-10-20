import { useEffect, useState } from "react";
import { Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
    describeRecurrence,
    FREQUENCY_LABELS,
    RECURRENCE_FREQUENCIES,
    WEEKDAY_SHORT,
    weekdayOf,
    type EntryRecurrence,
    type RecurrenceFrequency,
} from "../recurrence";
import { recurrenceRepository } from "../services/recurring-entries";
import type { DatabaseProperty } from "../types";

const fieldClass =
    "h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

const today = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const dayText = (day: string) =>
    new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short", year: "numeric" }).format(
        new Date(`${day}T00:00:00`),
    );

/** The "Wiederholen" row of an entry (package 25): shows the rule, sets it up, changes or stops it. */
export function RecurrenceSetting({
    entryId,
    dateProperties,
    editable,
}: {
    entryId: string;
    dateProperties: DatabaseProperty[];
    /** Online and with edit rights. */
    editable: boolean;
}) {
    const [rule, setRule] = useState<EntryRecurrence | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        let current = true;
        recurrenceRepository
            .get(entryId)
            .then((found) => {
                if (current) setRule(found);
            })
            .catch((err: unknown) => console.error("Wiederholung konnte nicht geladen werden:", err))
            .finally(() => {
                if (current) setLoaded(true);
            });
        return () => {
            current = false;
        };
    }, [entryId]);

    // Offline the rule cannot be read; without one, there is nothing to show unless it can be set up.
    if (!loaded || (!rule && !editable)) return null;

    // A copy that is due appears with the next load of the page tree.
    const next = rule && (rule.nextDate <= today() ? "heute" : `am ${dayText(rule.nextDate)}`);
    const text = rule ? `${describeRecurrence(rule)} · nächster Eintrag ${next}` : "Nicht wiederholt";

    return (
        <div className="grid grid-cols-[minmax(7rem,10rem)_1fr] items-start gap-2">
            <span className="flex min-h-8 items-center gap-1.5 text-sm text-muted-foreground">
                <Repeat className="size-3.5" aria-hidden="true" />
                Wiederholen
            </span>
            <button
                type="button"
                disabled={!editable}
                onClick={() => setOpen(true)}
                className={`flex min-h-8 items-center rounded px-1.5 text-left text-sm hover:bg-accent/60 disabled:hover:bg-transparent ${rule ? "" : "text-muted-foreground"}`}
            >
                {text}
            </button>
            {open && (
                <RecurrenceDialog
                    entryId={entryId}
                    rule={rule}
                    dateProperties={dateProperties}
                    onClose={() => setOpen(false)}
                    onSaved={setRule}
                />
            )}
        </div>
    );
}

function RecurrenceDialog({
    entryId,
    rule,
    dateProperties,
    onClose,
    onSaved,
}: {
    entryId: string;
    rule: EntryRecurrence | null;
    dateProperties: DatabaseProperty[];
    onClose: () => void;
    onSaved: (rule: EntryRecurrence | null) => void;
}) {
    const [frequency, setFrequency] = useState<RecurrenceFrequency>(rule?.frequency ?? "weekly");
    const [every, setEvery] = useState(rule?.interval ?? 1);
    const [startDate, setStartDate] = useState(rule?.startDate ?? today());
    const [weekdays, setWeekdays] = useState<number[]>(rule?.weekdays.length ? rule.weekdays : [weekdayOf(startDate)]);
    const [datePropertyId, setDatePropertyId] = useState(rule?.datePropertyId ?? dateProperties[0]?.id ?? "");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    async function run(action: () => Promise<EntryRecurrence | null>) {
        setBusy(true);
        setError("");
        try {
            onSaved(await action());
            onClose();
        } catch (err) {
            console.error("Wiederholung konnte nicht gespeichert werden:", err);
            setError("Das hat nicht geklappt. Prüfe die Internetverbindung und deine Rechte.");
            setBusy(false);
        }
    }

    const save = () =>
        run(() =>
            recurrenceRepository.save({
                pageId: entryId,
                frequency,
                interval: every,
                weekdays: frequency === "weekly" ? weekdays : [],
                startDate,
                datePropertyId: datePropertyId || null,
            }),
        );

    return (
        <Dialog labelledBy="recurrence-title" onClose={onClose} busy={busy} className="w-[min(28rem,calc(100vw-2rem))]">
            <h2 id="recurrence-title" className="text-lg font-semibold">
                Wiederholen
            </h2>
            <p className="text-sm text-muted-foreground">
                An jedem Termin entsteht eine Kopie dieses Eintrags mit Werten und Text, sobald jemand mit Schreibrecht
                Nodi öffnet.
            </p>
            <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 text-sm">
                    <span className="text-muted-foreground">Rhythmus</span>
                    <select
                        value={frequency}
                        onChange={(event) =>
                            setFrequency(
                                RECURRENCE_FREQUENCIES.find((item) => item === event.target.value) ?? frequency,
                            )
                        }
                        className={fieldClass}
                    >
                        {RECURRENCE_FREQUENCIES.map((item) => (
                            <option key={item} value={item}>
                                {FREQUENCY_LABELS[item]}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="space-y-1 text-sm">
                    <span className="text-muted-foreground">Alle …</span>
                    <input
                        type="number"
                        min={1}
                        max={365}
                        value={every}
                        onChange={(event) => setEvery(Math.min(365, Math.max(1, Number(event.target.value) || 1)))}
                        className={fieldClass}
                    />
                </label>
            </div>
            {frequency === "weekly" && (
                <div className="flex flex-wrap gap-1" role="group" aria-label="Wochentage">
                    {WEEKDAY_SHORT.map((label, index) => {
                        const day = index + 1;
                        const chosen = weekdays.includes(day);
                        return (
                            <button
                                key={label}
                                type="button"
                                aria-pressed={chosen}
                                onClick={() =>
                                    setWeekdays((current) =>
                                        chosen
                                            ? current.length > 1
                                                ? current.filter((item) => item !== day)
                                                : current
                                            : [...current, day],
                                    )
                                }
                                className="h-8 w-9 rounded border text-sm aria-pressed:border-brand aria-pressed:bg-brand/10 aria-pressed:font-medium"
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
            )}
            <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">Ab</span>
                <input
                    type="date"
                    value={startDate}
                    onChange={(event) => {
                        const next = event.target.value || startDate;
                        // Only the start's weekday chosen: it moves with the start.
                        setWeekdays((current) =>
                            current.length === 1 && current[0] === weekdayOf(startDate) ? [weekdayOf(next)] : current,
                        );
                        setStartDate(next);
                    }}
                    className={fieldClass}
                />
            </label>
            <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">Datum der Kopie in</span>
                <select
                    value={datePropertyId}
                    onChange={(event) => setDatePropertyId(event.target.value)}
                    className={fieldClass}
                >
                    <option value="">Keine Eigenschaft</option>
                    {dateProperties.map((property) => (
                        <option key={property.id} value={property.id}>
                            {property.name}
                        </option>
                    ))}
                </select>
            </label>
            <p className="text-sm">{describeRecurrence({ frequency, interval: every, weekdays, startDate })}</p>
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
                {rule && (
                    <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                            void run(async () => {
                                await recurrenceRepository.remove(entryId);
                                return null;
                            })
                        }
                        className="mr-auto"
                    >
                        Nicht mehr wiederholen
                    </Button>
                )}
                <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                    Abbrechen
                </Button>
                <Button type="button" onClick={() => void save()} disabled={busy}>
                    Speichern
                </Button>
            </div>
        </Dialog>
    );
}
