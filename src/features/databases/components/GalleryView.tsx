import { Plus } from "lucide-react";
import type { DatabaseRow } from "../database-model";
import type { DatabaseProperty } from "../types";
import { EntryCard } from "./EntryCard";

type GalleryViewProps = {
    rows: DatabaseRow[];
    properties: DatabaseProperty[];
    editable: boolean;
    onOpenEntry: (pageId: string) => void;
    /** Undefined: entries cannot be added here. */
    onCreateEntry?: () => Promise<void>;
};

/** Notion-like gallery: a grid of cards (without cover images for now). */
export function GalleryView({ rows, properties, editable, onOpenEntry, onCreateEntry }: GalleryViewProps) {
    return (
        <div className="px-[var(--page-gutter)]">
            {rows.length === 0 && <p className="pb-3 text-sm text-muted-foreground">Keine Einträge in dieser Ansicht.</p>}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3">
                {rows.map((row) => (
                    <EntryCard
                        key={row.page.id}
                        row={row}
                        properties={properties}
                        onOpen={() => onOpenEntry(row.page.id)}
                        className="min-h-24 justify-start"
                    />
                ))}
                {editable && onCreateEntry && (
                    <button
                        type="button"
                        onClick={() => void onCreateEntry()}
                        className="flex min-h-24 items-center justify-center gap-1.5 rounded-md border border-dashed text-sm text-muted-foreground hover:bg-accent/40"
                    >
                        <Plus className="size-4" />
                        Neu
                    </button>
                )}
            </div>
        </div>
    );
}
