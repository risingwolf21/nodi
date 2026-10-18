import { useState, type KeyboardEvent } from "react";
import { formatValue, hasOptions, isComputed, isDateValue } from "../database-model";
import type { DatabaseProperty, PropertyOption, PropertyValue } from "../types";
import { OptionBadge } from "./OptionBadge";
import { OptionPicker } from "./OptionPicker";

type PropertyValueEditorProps = {
    property: DatabaseProperty;
    value: PropertyValue;
    editable: boolean;
    onChange: (value: PropertyValue) => Promise<void>;
    /** Adds a choice to a select, multi-select or status property. */
    onCreateOption: (name: string) => Promise<PropertyOption>;
    onError: (message: string) => void;
    /** Numbers right-aligned, as in table columns. */
    alignNumbersRight?: boolean;
};

const fieldClass =
    "flex min-h-8 w-full min-w-0 items-center rounded px-2 py-1 text-left text-sm pointer-coarse:min-h-10";

function parseNumber(text: string): number | null | "invalid" {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const number = Number(trimmed.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(number) ? number : "invalid";
}

/** Shows a value and lets the user change it in place, per property type. */
export function PropertyValueEditor({
    property,
    value,
    editable,
    onChange,
    onCreateOption,
    onError,
    alignNumbersRight = false,
}: PropertyValueEditorProps) {
    const [draft, setDraft] = useState<string | null>(null);
    const [pickerOpen, setPickerOpen] = useState(false);
    const canChange = editable && !isComputed(property.type);

    function save(next: PropertyValue) {
        onChange(next).catch((err: unknown) => {
            onError(err instanceof Error ? err.message : "Der Wert konnte nicht gespeichert werden.");
        });
    }

    if (property.type === "checkbox") {
        return (
            <label className={`${fieldClass} cursor-pointer`}>
                <input
                    type="checkbox"
                    checked={value === true}
                    disabled={!canChange}
                    onChange={(event) => save(event.target.checked)}
                    aria-label={property.name}
                    className="size-4 accent-[var(--brand)]"
                />
            </label>
        );
    }

    if (hasOptions(property.type)) {
        const selectedIds = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
        const selected = selectedIds.flatMap((id) => property.options.filter((option) => option.id === id));
        const multiple = property.type === "multi_select";

        return (
            <div className="relative min-w-0">
                <button
                    type="button"
                    disabled={!canChange}
                    aria-label={`${property.name} wählen`}
                    aria-expanded={pickerOpen}
                    onClick={() => setPickerOpen(true)}
                    className={`${fieldClass} flex-wrap gap-1 hover:bg-accent/60 disabled:hover:bg-transparent`}
                >
                    {selected.map((option) => (
                        <OptionBadge key={option.id} option={option} />
                    ))}
                </button>
                {pickerOpen && (
                    <OptionPicker
                        open
                        options={property.options}
                        selectedIds={selectedIds}
                        multiple={multiple}
                        label={property.name}
                        onClose={() => setPickerOpen(false)}
                        onClear={() => save(null)}
                        onToggle={(optionId) => {
                            if (!multiple) return save(optionId);
                            const next = selectedIds.includes(optionId)
                                ? selectedIds.filter((id) => id !== optionId)
                                : [...selectedIds, optionId];
                            save(next.length > 0 ? next : null);
                        }}
                        onCreate={async (name) => {
                            const option = await onCreateOption(name);
                            save(multiple ? [...selectedIds, option.id] : option.id);
                        }}
                    />
                )}
            </div>
        );
    }

    if (property.type === "date") {
        const date = isDateValue(value) ? value : null;
        return (
            <input
                type="date"
                disabled={!canChange}
                value={date?.start.slice(0, 10) ?? ""}
                aria-label={property.name}
                onChange={(event) => save(event.target.value ? { start: event.target.value, end: date?.end ?? null } : null)}
                className={`${fieldClass} bg-transparent disabled:opacity-100`}
            />
        );
    }

    const shown = formatValue(property, value);

    if (draft !== null) {
        const commit = () => {
            const text = draft;
            setDraft(null);
            if (property.type === "number") {
                const number = parseNumber(text);
                if (number === "invalid") return onError("Bitte gib eine Zahl ein.");
                if (number !== value) save(number);
                return;
            }
            const next = text.trim() || null;
            if (next !== value) save(next);
        };
        const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
                event.preventDefault();
                setDraft(null);
            }
        };
        return (
            <input
                autoFocus
                type={property.type === "url" ? "url" : property.type === "email" ? "email" : "text"}
                inputMode={property.type === "number" ? "decimal" : undefined}
                value={draft}
                aria-label={property.name}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={commit}
                onKeyDown={onKeyDown}
                className={`${fieldClass} bg-background outline-none ring-2 ring-ring/50`}
            />
        );
    }

    const link =
        typeof value === "string" && property.type === "url"
            ? value
            : typeof value === "string" && property.type === "email"
              ? `mailto:${value}`
              : null;

    return (
        <div className="flex min-w-0 items-center">
            <button
                type="button"
                disabled={!canChange}
                aria-label={`${property.name} bearbeiten`}
                onClick={() => setDraft(property.type === "number" && typeof value === "number" ? String(value) : (typeof value === "string" ? value : ""))}
                className={`${fieldClass} min-w-0 flex-1 truncate hover:bg-accent/60 disabled:cursor-default disabled:hover:bg-transparent ${property.type === "number" ? "tabular-nums" : ""} ${property.type === "number" && alignNumbersRight ? "justify-end" : ""}`}
            >
                <span className="truncate">{shown}</span>
            </button>
            {link && (
                <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 px-1 text-xs text-brand underline-offset-2 hover:underline"
                >
                    Öffnen
                </a>
            )}
        </div>
    );
}
