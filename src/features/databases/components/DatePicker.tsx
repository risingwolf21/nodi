import { Clock } from "lucide-react";
import { Menu } from "@/components/ui/menu";
import { dateFromInput, dateHasTime, dateInputValue, setDateTime } from "../database-model";
import type { DatabaseProperty, DateValue } from "../types";

type DatePickerProps = {
    property: DatabaseProperty;
    value: DateValue | null;
    onClose: () => void;
    /** null clears the date. */
    onChange: (value: DateValue | null) => void;
};

const inputClass =
    "h-8 w-full rounded border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 pointer-coarse:h-10";
const switchClass =
    "flex h-8 w-full items-center gap-2 rounded px-2 text-left text-sm hover:bg-accent pointer-coarse:h-10";

/**
 * A date like in Notion (package 45b): shown as text, edited here on click
 * with a start, an optional end and an optional time of day.
 */
export function DatePicker({ property, value, onClose, onChange }: DatePickerProps) {
    const withTime = value !== null && dateHasTime(value);
    const type = withTime ? "datetime-local" : "date";

    return (
        <Menu detached open onClose={onClose} align="start" role="dialog" label={property.name} className="w-64 p-2">
            <div className="space-y-2">
                <input
                    autoFocus
                    type={type}
                    aria-label={value?.end ? `${property.name}: Beginn` : property.name}
                    value={value ? dateInputValue(value.start) : ""}
                    onChange={(event) => {
                        const start = dateFromInput(event.target.value);
                        onChange(start ? { start, end: value?.end ?? null } : null);
                    }}
                    className={inputClass}
                />
                {value?.end && (
                    <input
                        type={type}
                        aria-label={`${property.name}: Ende`}
                        min={dateInputValue(value.start)}
                        value={dateInputValue(value.end)}
                        onChange={(event) => onChange({ start: value.start, end: dateFromInput(event.target.value) })}
                        className={inputClass}
                    />
                )}
            </div>
            {value && (
                <div className="mt-2 border-t pt-1">
                    <button
                        type="button"
                        role="switch"
                        aria-checked={value.end !== null}
                        onClick={() => onChange({ start: value.start, end: value.end ? null : value.start })}
                        className={switchClass}
                    >
                        <span className="flex-1">Enddatum</span>
                        <Toggle on={value.end !== null} />
                    </button>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={withTime}
                        aria-label={`Uhrzeit für ${property.name}`}
                        onClick={() => onChange(setDateTime(value, !withTime))}
                        className={switchClass}
                    >
                        <Clock className="size-4 text-muted-foreground" aria-hidden="true" />
                        <span className="flex-1">Uhrzeit</span>
                        <Toggle on={withTime} />
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            onChange(null);
                            onClose();
                        }}
                        className={`${switchClass} text-muted-foreground`}
                    >
                        Leeren
                    </button>
                </div>
            )}
        </Menu>
    );
}

function Toggle({ on }: { on: boolean }) {
    return (
        <span
            aria-hidden="true"
            className={`flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors ${on ? "bg-brand" : "bg-muted-foreground/30"}`}
        >
            <span className={`size-3 rounded-full bg-white transition-transform ${on ? "translate-x-3" : ""}`} />
        </span>
    );
}
