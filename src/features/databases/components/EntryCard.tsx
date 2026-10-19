import type { DragEvent } from "react";
import { CheckSquare, FileText, Square } from "lucide-react";
import { displayTitle } from "@/features/pages/page-display";
import { cn } from "@/lib/utils";
import { formatValue, hasOptions, type DatabaseRow } from "../database-model";
import type { DatabaseProperty, PropertyValue } from "../types";
import { FormulaErrorText } from "./FormulaErrorText";
import { OptionBadge } from "./OptionBadge";

/** A value on a card or a list row, read-only; nothing for an empty value. */
export function PropertyValueText({
    property,
    value,
    error,
}: {
    property: DatabaseProperty;
    value: PropertyValue;
    /** A formula that could not be computed. */
    error?: string;
}) {
    if (error) return <FormulaErrorText error={error} className="truncate text-xs" />;
    if (value === null) return null;

    if (hasOptions(property.type)) {
        const ids = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
        const options = ids.flatMap((id) => property.options.filter((option) => option.id === id));
        if (options.length === 0) return null;
        return (
            <span className="flex min-w-0 flex-wrap gap-1">
                {options.map((option) => (
                    <OptionBadge key={option.id} option={option} />
                ))}
            </span>
        );
    }

    if (property.type === "checkbox") {
        const Icon = value === true ? CheckSquare : Square;
        return (
            <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{property.name}</span>
                <span className="sr-only">{formatValue(property, value)}</span>
            </span>
        );
    }

    const text = formatValue(property, value);
    if (!text) return null;
    return (
        <span className="truncate text-xs text-muted-foreground" title={`${property.name}: ${text}`}>
            {text}
        </span>
    );
}

type EntryCardProps = {
    row: DatabaseRow;
    /** Shown below the title, in order. */
    properties: DatabaseProperty[];
    onOpen: () => void;
    /** Board: cards can be dragged into another column. */
    onDragStart?: (event: DragEvent<HTMLButtonElement>) => void;
    className?: string;
};

/** An entry as a card (board, gallery): opens the entry on click. */
export function EntryCard({ row, properties, onOpen, onDragStart, className }: EntryCardProps) {
    return (
        <button
            type="button"
            onClick={onOpen}
            draggable={onDragStart !== undefined}
            onDragStart={onDragStart}
            className={cn(
                "flex w-full min-w-0 flex-col gap-1.5 rounded-md border bg-background p-2.5 text-left shadow-xs hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                className,
            )}
        >
            <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                <span className="flex size-5 shrink-0 items-center justify-center" aria-hidden="true">
                    {row.page.icon ?? <FileText className="size-4 text-muted-foreground" />}
                </span>
                <span className={cn("truncate", !row.page.title && "text-muted-foreground")}>
                    {displayTitle(row.page)}
                </span>
            </span>
            {properties.map((property) => (
                <PropertyValueText
                    key={property.id}
                    property={property}
                    value={row.values[property.id] ?? null}
                    error={row.errors[property.id]}
                />
            ))}
        </button>
    );
}
