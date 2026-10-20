import { useState } from "react";
import { ArrowUpDown, Check, Eye, EyeOff, Filter, Plus, SlidersHorizontal, X, type LucideIcon } from "lucide-react";
import { Menu } from "@/components/ui/menu";
import { FILTER_OPERATOR_LABELS, hasOptions, operatorNeedsValue, operatorsFor } from "../database-model";
import { TITLE_FIELD, type DatabaseProperty, type FilterRule, type SortRule, type ViewConfig } from "../types";

type PanelProps = {
    config: ViewConfig;
    properties: DatabaseProperty[];
    editable: boolean;
    onChange: (config: ViewConfig) => Promise<void>;
    onError: (message: string) => void;
};

const selectClass =
    "h-7 min-w-0 rounded border bg-background px-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60";
const toolbarButton =
    "flex h-7 items-center gap-1 rounded px-2 text-xs text-muted-foreground hover:bg-accent/60 hover:text-foreground pointer-coarse:h-9";

function fieldType(propertyId: string, properties: DatabaseProperty[]) {
    return propertyId === TITLE_FIELD ? TITLE_FIELD : properties.find((property) => property.id === propertyId)?.type;
}

function FieldSelect({
    value,
    properties,
    disabled,
    onChange,
}: {
    value: string;
    properties: DatabaseProperty[];
    disabled: boolean;
    onChange: (propertyId: string) => void;
}) {
    return (
        <select
            aria-label="Eigenschaft"
            value={value}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            className={`${selectClass} flex-1`}
        >
            <option value={TITLE_FIELD}>Name</option>
            {properties.map((property) => (
                <option key={property.id} value={property.id}>
                    {property.name}
                </option>
            ))}
        </select>
    );
}

function FilterValueInput({
    rule,
    property,
    disabled,
    onChange,
}: {
    rule: FilterRule;
    property: DatabaseProperty | undefined;
    disabled: boolean;
    onChange: (value: string) => void;
}) {
    // Text is saved when the field is left, not on every key.
    const [draft, setDraft] = useState(rule.value);

    if (!operatorNeedsValue(rule.operator)) return null;

    if (property && hasOptions(property.type)) {
        return (
            <select
                aria-label="Wert"
                value={rule.value}
                disabled={disabled}
                onChange={(event) => onChange(event.target.value)}
                className={`${selectClass} flex-1`}
            >
                <option value="">–</option>
                {property.options.map((option) => (
                    <option key={option.id} value={option.id}>
                        {option.name}
                    </option>
                ))}
            </select>
        );
    }

    const isDate = property && ["date", "created_time", "last_edited_time"].includes(property.type);
    return (
        <input
            aria-label="Wert"
            type={isDate ? "date" : "text"}
            inputMode={property?.type === "number" ? "decimal" : undefined}
            value={draft}
            disabled={disabled}
            onChange={(event) => {
                setDraft(event.target.value);
                if (isDate) onChange(event.target.value);
            }}
            onBlur={() => {
                if (!isDate && draft !== rule.value) onChange(draft);
            }}
            onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
            }}
            className={`${selectClass} flex-1 px-2`}
        />
    );
}

/** "Filter" in the toolbar: all rules must match. */
export function FilterPanel({ config, properties, editable, onChange, onError }: PanelProps) {
    const [open, setOpen] = useState(false);

    function save(filter: FilterRule[]) {
        onChange({ ...config, filter }).catch((err: unknown) =>
            onError(err instanceof Error ? err.message : "Der Filter konnte nicht gespeichert werden."),
        );
    }

    function update(index: number, changes: Partial<FilterRule>) {
        save(config.filter.map((rule, position) => (position === index ? { ...rule, ...changes } : rule)));
    }

    return (
        <div className="relative">
            <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen(true)}
                className={`${toolbarButton} ${config.filter.length > 0 ? "text-brand" : ""}`}
            >
                <Filter className="size-3.5" />
                Filter{config.filter.length > 0 ? ` (${config.filter.length})` : ""}
            </button>
            <Menu
                detached
                open={open}
                onClose={() => setOpen(false)}
                role="dialog"
                label="Filter"
                className="w-[min(26rem,calc(100vw-2rem))] p-2"
            >
                {config.filter.length === 0 && (
                    <p className="px-1 pb-2 text-xs text-muted-foreground">
                        Noch keine Filter: alle Einträge werden gezeigt.
                    </p>
                )}
                <ul className="space-y-1.5">
                    {config.filter.map((rule, index) => {
                        const property = properties.find((item) => item.id === rule.propertyId);
                        const type = fieldType(rule.propertyId, properties) ?? "text";
                        return (
                            <li key={index} className="flex items-center gap-1">
                                <FieldSelect
                                    value={rule.propertyId}
                                    properties={properties}
                                    disabled={!editable}
                                    onChange={(propertyId) => {
                                        const operators = operatorsFor(fieldType(propertyId, properties) ?? "text");
                                        update(index, { propertyId, operator: operators[0], value: "" });
                                    }}
                                />
                                <select
                                    aria-label="Bedingung"
                                    value={rule.operator}
                                    disabled={!editable}
                                    onChange={(event) => {
                                        const operator = operatorsFor(type).find((item) => item === event.target.value);
                                        if (operator) update(index, { operator });
                                    }}
                                    className={selectClass}
                                >
                                    {operatorsFor(type).map((operator) => (
                                        <option key={operator} value={operator}>
                                            {FILTER_OPERATOR_LABELS[operator]}
                                        </option>
                                    ))}
                                </select>
                                <FilterValueInput
                                    key={`${index}:${rule.propertyId}:${rule.operator}:${rule.value}`}
                                    rule={rule}
                                    property={property}
                                    disabled={!editable}
                                    onChange={(value) => update(index, { value })}
                                />
                                {editable && (
                                    <button
                                        type="button"
                                        aria-label="Filter entfernen"
                                        onClick={() => save(config.filter.filter((_, position) => position !== index))}
                                        className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent"
                                    >
                                        <X className="size-3.5" />
                                    </button>
                                )}
                            </li>
                        );
                    })}
                </ul>
                {editable && (
                    <button
                        type="button"
                        onClick={() =>
                            save([...config.filter, { propertyId: TITLE_FIELD, operator: "contains", value: "" }])
                        }
                        className={`${toolbarButton} mt-2`}
                    >
                        <Plus className="size-3.5" />
                        Filter hinzufügen
                    </button>
                )}
            </Menu>
        </div>
    );
}

/** "Eigenschaften": which properties the view shows. */
export function PropertiesPanel({ config, properties, editable, onChange, onError }: PanelProps) {
    const [open, setOpen] = useState(false);
    const hidden = new Set(config.hiddenPropertyIds);

    function toggle(propertyId: string) {
        const hiddenPropertyIds = hidden.has(propertyId)
            ? config.hiddenPropertyIds.filter((id) => id !== propertyId)
            : [...config.hiddenPropertyIds, propertyId];
        onChange({ ...config, hiddenPropertyIds }).catch((err: unknown) =>
            onError(err instanceof Error ? err.message : "Die Ansicht konnte nicht gespeichert werden."),
        );
    }

    return (
        <div className="relative">
            <button
                type="button"
                aria-label="Eigenschaften"
                aria-expanded={open}
                onClick={() => setOpen(true)}
                className={toolbarButton}
            >
                <SlidersHorizontal className="size-3.5" />
                <span className="hidden sm:inline">Eigenschaften</span>
            </button>
            <Menu
                detached
                open={open}
                onClose={() => setOpen(false)}
                role="dialog"
                label="Eigenschaften"
                className="w-60 p-1"
            >
                {properties.length === 0 && (
                    <p className="px-2 py-1 text-xs text-muted-foreground">Noch keine Eigenschaften.</p>
                )}
                {[...properties]
                    .sort((a, b) => a.position - b.position)
                    .map((property) => (
                        <button
                            key={property.id}
                            type="button"
                            disabled={!editable}
                            aria-pressed={!hidden.has(property.id)}
                            onClick={() => toggle(property.id)}
                            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-60 pointer-coarse:py-2.5"
                        >
                            <span className="min-w-0 flex-1 truncate">{property.name}</span>
                            {hidden.has(property.id) ? (
                                <EyeOff className="size-4 text-muted-foreground" aria-label="ausgeblendet" />
                            ) : (
                                <Eye className="size-4" aria-label="sichtbar" />
                            )}
                        </button>
                    ))}
            </Menu>
        </div>
    );
}

/** "Sortieren" in the toolbar: the first rule decides, the next ones break ties. */
export function SortPanel({ config, properties, editable, onChange, onError }: PanelProps) {
    const [open, setOpen] = useState(false);

    function save(sort: SortRule[]) {
        onChange({ ...config, sort }).catch((err: unknown) =>
            onError(err instanceof Error ? err.message : "Die Sortierung konnte nicht gespeichert werden."),
        );
    }

    return (
        <div className="relative">
            <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen(true)}
                className={`${toolbarButton} ${config.sort.length > 0 ? "text-brand" : ""}`}
            >
                <ArrowUpDown className="size-3.5" />
                Sortieren{config.sort.length > 0 ? ` (${config.sort.length})` : ""}
            </button>
            <Menu
                detached
                open={open}
                onClose={() => setOpen(false)}
                role="dialog"
                label="Sortieren"
                className="w-[min(22rem,calc(100vw-2rem))] p-2"
            >
                {config.sort.length === 0 && (
                    <p className="px-1 pb-2 text-xs text-muted-foreground">
                        Ohne Sortierung gilt die eigene Reihenfolge.
                    </p>
                )}
                <ul className="space-y-1.5">
                    {config.sort.map((rule, index) => (
                        <li key={index} className="flex items-center gap-1">
                            <FieldSelect
                                value={rule.propertyId}
                                properties={properties}
                                disabled={!editable}
                                onChange={(propertyId) =>
                                    save(
                                        config.sort.map((item, position) =>
                                            position === index ? { ...item, propertyId } : item,
                                        ),
                                    )
                                }
                            />
                            <select
                                aria-label="Richtung"
                                value={rule.direction}
                                disabled={!editable}
                                onChange={(event) =>
                                    save(
                                        config.sort.map((item, position) =>
                                            position === index
                                                ? { ...item, direction: event.target.value === "desc" ? "desc" : "asc" }
                                                : item,
                                        ),
                                    )
                                }
                                className={selectClass}
                            >
                                <option value="asc">Aufsteigend</option>
                                <option value="desc">Absteigend</option>
                            </select>
                            {editable && (
                                <button
                                    type="button"
                                    aria-label="Sortierung entfernen"
                                    onClick={() => save(config.sort.filter((_, position) => position !== index))}
                                    className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent"
                                >
                                    <X className="size-3.5" />
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
                {editable && (
                    <button
                        type="button"
                        onClick={() => save([...config.sort, { propertyId: TITLE_FIELD, direction: "asc" }])}
                        className={`${toolbarButton} mt-2`}
                    >
                        <Plus className="size-3.5" />
                        Sortierung hinzufügen
                    </button>
                )}
            </Menu>
        </div>
    );
}

/**
 * Which property a view is built on: the columns of a board ("Gruppieren")
 * or the dates of a calendar ("Datum").
 */
export function PropertyChoicePanel({
    label,
    icon: Icon,
    emptyText,
    choices,
    current,
    editable,
    onChoose,
    onError,
    noneLabel,
}: {
    label: string;
    icon: LucideIcon;
    emptyText: string;
    choices: DatabaseProperty[];
    current: DatabaseProperty | undefined;
    editable: boolean;
    onChoose: (propertyId: string | null) => Promise<void>;
    onError: (message: string) => void;
    /** A first choice for "none", e.g. "Nicht gruppieren" (package 32c). */
    noneLabel?: string;
}) {
    const [open, setOpen] = useState(false);

    function choose(propertyId: string | null) {
        setOpen(false);
        onChoose(propertyId).catch((err: unknown) =>
            onError(err instanceof Error ? err.message : "Die Ansicht konnte nicht gespeichert werden."),
        );
    }

    return (
        <div className="relative">
            <button
                type="button"
                aria-label={label}
                aria-expanded={open}
                onClick={() => setOpen(true)}
                className={toolbarButton}
            >
                <Icon className="size-3.5" />
                <span className="hidden sm:inline">
                    {label}
                    {current ? `: ${current.name}` : ""}
                </span>
            </button>
            <Menu detached open={open} onClose={() => setOpen(false)} role="dialog" label={label} className="w-60 p-1">
                {choices.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">{emptyText}</p>}
                {noneLabel && choices.length > 0 && (
                    <button
                        type="button"
                        disabled={!editable}
                        aria-pressed={current === undefined}
                        onClick={() => choose(null)}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-60 pointer-coarse:py-2.5"
                    >
                        <span className="min-w-0 flex-1 truncate">{noneLabel}</span>
                        {current === undefined && <Check className="size-4" aria-hidden="true" />}
                    </button>
                )}
                {[...choices]
                    .sort((a, b) => a.position - b.position)
                    .map((property) => (
                        <button
                            key={property.id}
                            type="button"
                            disabled={!editable}
                            aria-pressed={property.id === current?.id}
                            onClick={() => choose(property.id)}
                            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-60 pointer-coarse:py-2.5"
                        >
                            <span className="min-w-0 flex-1 truncate">{property.name}</span>
                            {property.id === current?.id && <Check className="size-4" aria-hidden="true" />}
                        </button>
                    ))}
            </Menu>
        </div>
    );
}
