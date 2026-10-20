import { useRef, useState, type DragEvent } from "react";
import { Plus } from "lucide-react";
import { displayTitle } from "@/features/pages/page-display";
import { cn } from "@/lib/utils";
import { groupRows, type DatabaseRow } from "../database-model";
import type { DatabaseProperty } from "../types";
import { EntryCard } from "./EntryCard";
import { OptionBadge } from "./OptionBadge";

type BoardViewProps = {
    rows: DatabaseRow[];
    /** Visible properties; the group property is left off the cards. */
    properties: DatabaseProperty[];
    /** Undefined: the database has no select or status property yet. */
    groupBy: DatabaseProperty | undefined;
    editable: boolean;
    onOpenEntry: (pageId: string) => void;
    /** New entry in a column; undefined: entries cannot be added here. */
    onCreateEntry?: (optionId: string | null) => Promise<void>;
    /** Moves an entry into another column by changing its value. */
    onMoveEntry: (pageId: string, optionId: string | null) => Promise<void>;
    /** Puts an entry before another one (null: at the end); undefined while a sort rule decides the order. */
    onPlaceEntry?: (pageId: string, beforeId: string | null) => Promise<void>;
    onAddGroupProperty: () => Promise<void>;
    onError: (message: string) => void;
};

const NO_VALUE_COLUMN = "none";

/**
 * Notion-like board: one column per option of a select or status property.
 * Cards move by drag and drop (mouse); on touch devices the value is
 * changed in the entry.
 */
export function BoardView({
    rows,
    properties,
    groupBy,
    editable,
    onOpenEntry,
    onCreateEntry,
    onMoveEntry,
    onPlaceEntry,
    onAddGroupProperty,
    onError,
}: BoardViewProps) {
    const dragged = useRef<{ pageId: string; from: string } | null>(null);
    const [dropTarget, setDropTarget] = useState("");
    // A card a dragged one would land before (package 32a).
    const [dropBefore, setDropBefore] = useState("");

    if (!groupBy) {
        return (
            <div className="px-[var(--page-gutter)] py-6 text-sm text-muted-foreground">
                <p>Ein Board ordnet Einträge nach einer Auswahl- oder Status-Eigenschaft.</p>
                {editable && (
                    <button
                        type="button"
                        onClick={() =>
                            void onAddGroupProperty().catch((err: unknown) =>
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
                        Status-Eigenschaft anlegen
                    </button>
                )}
            </div>
        );
    }

    const property = groupBy;
    const cardProperties = properties.filter((item) => item.id !== property.id);
    const groups = groupRows(rows, property);

    /** Into a column, before a card of it (or at its end). */
    function drop(event: DragEvent<HTMLElement>, optionId: string | null, beforeId: string | null = null) {
        event.preventDefault();
        event.stopPropagation();
        setDropTarget("");
        setDropBefore("");
        const card = dragged.current;
        dragged.current = null;
        if (!card) return;
        const otherColumn = card.from !== (optionId ?? NO_VALUE_COLUMN);
        if (!otherColumn && (!onPlaceEntry || beforeId === null || beforeId === card.pageId)) return;
        (async () => {
            if (otherColumn) await onMoveEntry(card.pageId, optionId);
            if (onPlaceEntry && beforeId !== card.pageId) await onPlaceEntry(card.pageId, beforeId);
        })().catch((err: unknown) =>
            onError(err instanceof Error ? err.message : "Der Eintrag konnte nicht verschoben werden."),
        );
    }

    return (
        <div className="overflow-x-auto px-[var(--page-gutter)] pb-4">
            <div className="flex w-max gap-3">
                {groups.map((group) => {
                    const key = group.option?.id ?? NO_VALUE_COLUMN;
                    const label = group.option?.name ?? `Ohne ${property.name}`;
                    return (
                        <section
                            key={key}
                            aria-label={label}
                            onDragOver={(event) => {
                                if (!editable || !dragged.current) return;
                                event.preventDefault();
                                setDropTarget(key);
                            }}
                            onDragLeave={() => setDropTarget((current) => (current === key ? "" : current))}
                            onDrop={(event) => drop(event, group.option?.id ?? null)}
                            className={cn(
                                "flex w-64 shrink-0 flex-col gap-2 rounded-lg bg-muted/40 p-2",
                                dropTarget === key && "ring-2 ring-[var(--brand)]/50",
                            )}
                        >
                            <header className="flex h-6 items-center gap-2 px-1 text-xs text-muted-foreground">
                                {group.option ? <OptionBadge option={group.option} /> : <span>{label}</span>}
                                <span aria-label={`${group.rows.length} Einträge`}>{group.rows.length}</span>
                            </header>
                            {group.rows.map((row) => (
                                <div
                                    key={row.page.id}
                                    onDragOver={(event) => {
                                        if (!editable || !dragged.current || !onPlaceEntry) return;
                                        event.preventDefault();
                                        setDropBefore(row.page.id);
                                    }}
                                    onDragLeave={() =>
                                        setDropBefore((current) => (current === row.page.id ? "" : current))
                                    }
                                    onDrop={(event) => {
                                        if (onPlaceEntry) drop(event, group.option?.id ?? null, row.page.id);
                                    }}
                                    className={cn(
                                        "rounded-lg",
                                        dropBefore === row.page.id && "shadow-[0_-3px_0_var(--brand)]",
                                    )}
                                >
                                    <EntryCard
                                        row={row}
                                        properties={cardProperties}
                                        onOpen={() => onOpenEntry(row.page.id)}
                                        onDragStart={
                                            editable
                                                ? (event) => {
                                                      dragged.current = { pageId: row.page.id, from: key };
                                                      event.dataTransfer.effectAllowed = "move";
                                                      // Firefox only starts a drag that carries data.
                                                      event.dataTransfer.setData("text/plain", displayTitle(row.page));
                                                  }
                                                : undefined
                                        }
                                    />
                                </div>
                            ))}
                            {editable && onCreateEntry && (
                                <button
                                    type="button"
                                    onClick={() => void onCreateEntry(group.option?.id ?? null)}
                                    className="flex h-8 items-center gap-1.5 rounded px-1 text-sm text-muted-foreground hover:bg-accent/60 pointer-coarse:h-10"
                                >
                                    <Plus className="size-4" />
                                    Neu
                                </button>
                            )}
                        </section>
                    );
                })}
            </div>
        </div>
    );
}
