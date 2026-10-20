import { useState, type KeyboardEvent } from "react";
import { Clock, Paperclip } from "lucide-react";
import { fileNameOfPath } from "@/features/files/file-reference";
import { displayTitle } from "@/features/pages/page-display";
import {
    dateFromInput,
    dateHasTime,
    dateInputValue,
    formatValue,
    hasOptions,
    isComputed,
    isDateValue,
    isPlaceValue,
    chosenPeople,
    relatedEntries,
    setDateTime,
} from "../database-model";
import type { DatabaseProperty, PropertyOption, PropertyValue } from "../types";
import { OptionBadge } from "./OptionBadge";
import { OptionPicker } from "./OptionPicker";
import { FilesPicker } from "./FilesPicker";
import { FormulaErrorText } from "./FormulaErrorText";
import { PlacePicker } from "./PlacePicker";
import { RelationPicker } from "./RelationPicker";

const OSM_ZOOM = 16;

type PropertyValueEditorProps = {
    property: DatabaseProperty;
    /** The entry; files are uploaded into its folder. */
    pageId: string;
    value: PropertyValue;
    editable: boolean;
    onChange: (value: PropertyValue) => Promise<void>;
    /** Adds a choice to a select, multi-select or status property. */
    onCreateOption: (name: string) => Promise<PropertyOption>;
    onError: (message: string) => void;
    /** Numbers right-aligned, as in table columns. */
    alignNumbersRight?: boolean;
    /** A formula that could not be computed. */
    error?: string;
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
    pageId,
    value,
    editable,
    onChange,
    onCreateOption,
    onError,
    alignNumbersRight = false,
    error,
}: PropertyValueEditorProps) {
    const [draft, setDraft] = useState<string | null>(null);
    const [pickerOpen, setPickerOpen] = useState(false);
    const canChange = editable && !isComputed(property.type);

    if (error) return <FormulaErrorText error={error} className={fieldClass} />;

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

    if (property.type === "relation") {
        const selectedIds = Array.isArray(value) ? value : [];
        const linked = relatedEntries(property, value);
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
                    {linked.map((entry) => (
                        <span key={entry.id} className="max-w-full truncate rounded border px-1.5 py-0.5 text-xs">
                            {entry.icon ? `${entry.icon} ` : ""}
                            {displayTitle(entry)}
                        </span>
                    ))}
                </button>
                {pickerOpen && (
                    <RelationPicker
                        open
                        entries={property.relation?.entries ?? []}
                        selectedIds={selectedIds}
                        label={property.name}
                        onClose={() => setPickerOpen(false)}
                        onClear={() => save(null)}
                        onToggle={(entryId) => {
                            const next = selectedIds.includes(entryId)
                                ? selectedIds.filter((id) => id !== entryId)
                                : [...selectedIds, entryId];
                            save(next.length > 0 ? next : null);
                        }}
                    />
                )}
            </div>
        );
    }

    if (property.type === "person") {
        const selectedIds = Array.isArray(value) ? value : [];
        const people = property.people ?? [];
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
                    {chosenPeople(property, value).map((person) => (
                        <span key={person.id} className="max-w-full truncate rounded-full border px-1.5 py-0.5 text-xs">
                            {person.email}
                        </span>
                    ))}
                </button>
                {pickerOpen && (
                    <RelationPicker
                        open
                        entries={people.map((person) => ({ id: person.id, title: person.email, icon: null }))}
                        selectedIds={selectedIds}
                        label={property.name}
                        searchLabel="Person suchen"
                        emptyText="Nur Mitglieder des Workspace sehen die Personen."
                        noMatchText="Keine Person gefunden."
                        onClose={() => setPickerOpen(false)}
                        onClear={() => save(null)}
                        onToggle={(personId) => {
                            const next = selectedIds.includes(personId)
                                ? selectedIds.filter((id) => id !== personId)
                                : [...selectedIds, personId];
                            save(next.length > 0 ? next : null);
                        }}
                    />
                )}
            </div>
        );
    }

    if (property.type === "files") {
        const paths = Array.isArray(value) ? value : [];
        return (
            <div className="relative min-w-0">
                {/* Opening files works without the right to edit. */}
                <button
                    type="button"
                    aria-label={`${property.name} anzeigen`}
                    aria-expanded={pickerOpen}
                    onClick={() => setPickerOpen(true)}
                    className={`${fieldClass} flex-wrap gap-1 hover:bg-accent/60`}
                >
                    {paths.map((path) => (
                        <span
                            key={path}
                            className="flex max-w-full items-center gap-1 truncate rounded border px-1.5 py-0.5 text-xs"
                        >
                            <Paperclip className="size-3 shrink-0" aria-hidden="true" />
                            {fileNameOfPath(path)}
                        </span>
                    ))}
                </button>
                {pickerOpen && (
                    <FilesPicker
                        label={property.name}
                        pageId={pageId}
                        paths={paths}
                        editable={canChange}
                        onClose={() => setPickerOpen(false)}
                        onChange={(next) => save(next.length > 0 ? next : null)}
                        onError={onError}
                    />
                )}
            </div>
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
        const withTime = date !== null && dateHasTime(date);
        return (
            <div className="flex min-w-0 items-center">
                <input
                    type={withTime ? "datetime-local" : "date"}
                    disabled={!canChange}
                    value={date ? dateInputValue(date.start) : ""}
                    aria-label={property.name}
                    onChange={(event) => {
                        const start = dateFromInput(event.target.value);
                        save(start ? { start, end: date?.end ?? null } : null);
                    }}
                    className={`${fieldClass} min-w-0 flex-1 bg-transparent disabled:opacity-100`}
                />
                {date && canChange && (
                    <button
                        type="button"
                        aria-pressed={withTime}
                        aria-label={`Uhrzeit für ${property.name}`}
                        title={withTime ? "Uhrzeit entfernen" : "Uhrzeit hinzufügen"}
                        onClick={() => save(setDateTime(date, !withTime))}
                        className={`flex size-7 shrink-0 items-center justify-center rounded hover:bg-accent pointer-coarse:size-9 ${withTime ? "text-brand" : "text-muted-foreground"}`}
                    >
                        <Clock className="size-3.5" />
                    </button>
                )}
            </div>
        );
    }

    if (property.type === "place") {
        const place = isPlaceValue(value) ? value : null;
        return (
            <div className="relative flex min-w-0 items-center">
                <button
                    type="button"
                    disabled={!canChange}
                    aria-label={`${property.name} wählen`}
                    aria-expanded={pickerOpen}
                    onClick={() => setPickerOpen(true)}
                    className={`${fieldClass} min-w-0 flex-1 hover:bg-accent/60 disabled:cursor-default disabled:hover:bg-transparent`}
                >
                    <span className="truncate">{formatValue(property, place)}</span>
                </button>
                {place && (
                    <a
                        href={`https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lng}#map=${OSM_ZOOM}/${place.lat}/${place.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 px-1 text-xs text-brand underline-offset-2 hover:underline"
                    >
                        Karte
                    </a>
                )}
                {pickerOpen && (
                    <PlacePicker
                        property={property}
                        value={place}
                        onClose={() => setPickerOpen(false)}
                        onChange={save}
                    />
                )}
            </div>
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
                onClick={() =>
                    setDraft(
                        property.type === "number" && typeof value === "number"
                            ? String(value)
                            : typeof value === "string"
                              ? value
                              : "",
                    )
                }
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
