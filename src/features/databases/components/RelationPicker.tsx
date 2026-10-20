import { useState } from "react";
import { Check } from "lucide-react";
import { Menu } from "@/components/ui/menu";
import { displayTitle } from "@/features/pages/page-display";
import type { RelatedEntry } from "../types";

type RelationPickerProps = {
    open: boolean;
    entries: RelatedEntry[];
    selectedIds: string[];
    label: string;
    onClose: () => void;
    onToggle: (entryId: string) => void;
    onClear: () => void;
    /** Texts for other lists than entries (people, package 29). */
    searchLabel?: string;
    emptyText?: string;
    noMatchText?: string;
};

/** Linking entries of the related database: type to filter, click to link or unlink. Also picks people. */
export function RelationPicker({
    open,
    entries,
    selectedIds,
    label,
    onClose,
    onToggle,
    onClear,
    searchLabel = "Eintrag suchen",
    emptyText = "Die verknüpfte Datenbank hat keine Einträge.",
    noMatchText = "Kein Eintrag gefunden.",
}: RelationPickerProps) {
    const [query, setQuery] = useState("");
    const needle = query.trim().toLocaleLowerCase("de");
    const matching = entries.filter((entry) => displayTitle(entry).toLocaleLowerCase("de").includes(needle));

    return (
        <Menu detached open={open} onClose={onClose} align="start" role="dialog" label={label} className="w-64">
            <div className="p-1">
                <input
                    autoFocus
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={searchLabel}
                    aria-label={searchLabel}
                    className="h-7 w-full rounded border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                />
            </div>
            <ul className="max-h-60 overflow-y-auto py-1">
                {matching.map((entry) => (
                    <li key={entry.id}>
                        <button
                            type="button"
                            aria-pressed={selectedIds.includes(entry.id)}
                            onClick={() => onToggle(entry.id)}
                            className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-accent pointer-coarse:py-2"
                        >
                            <span className={`min-w-0 flex-1 truncate ${entry.title ? "" : "text-muted-foreground"}`}>
                                {entry.icon ? `${entry.icon} ` : ""}
                                {displayTitle(entry)}
                            </span>
                            {selectedIds.includes(entry.id) && <Check className="size-4 shrink-0 text-brand" />}
                        </button>
                    </li>
                ))}
                {matching.length === 0 && (
                    <li className="px-2 py-1 text-xs text-muted-foreground">
                        {entries.length === 0 ? emptyText : noMatchText}
                    </li>
                )}
            </ul>
            {selectedIds.length > 0 && (
                <button
                    type="button"
                    onClick={() => {
                        onClear();
                        onClose();
                    }}
                    className="w-full rounded border-t px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent"
                >
                    Leeren
                </button>
            )}
        </Menu>
    );
}
