import { FileText, Plus } from "lucide-react";
import { displayTitle } from "@/features/pages/page-display";
import type { DatabaseRow } from "../database-model";
import type { DatabaseProperty } from "../types";
import { PropertyValueText } from "./EntryCard";

type ListViewProps = {
    rows: DatabaseRow[];
    properties: DatabaseProperty[];
    editable: boolean;
    onOpenEntry: (pageId: string) => void;
    /** Undefined: entries cannot be added here. */
    onCreateEntry?: () => Promise<void>;
};

/** Notion-like list: one compact line per entry, values on the right. */
export function ListView({ rows, properties, editable, onOpenEntry, onCreateEntry }: ListViewProps) {
    return (
        <div className="px-[var(--page-gutter)]">
            <ul className="border-t">
                {rows.map((row) => (
                    <li key={row.page.id} className="border-b">
                        <button
                            type="button"
                            onClick={() => onOpenEntry(row.page.id)}
                            className="flex min-h-9 w-full min-w-0 items-center gap-3 px-1 py-1 text-left hover:bg-accent/40 pointer-coarse:min-h-11"
                        >
                            <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium">
                                <span className="flex size-5 shrink-0 items-center justify-center" aria-hidden="true">
                                    {row.page.icon ?? <FileText className="size-4 text-muted-foreground" />}
                                </span>
                                <span className={`truncate ${row.page.title ? "" : "text-muted-foreground"}`}>
                                    {displayTitle(row.page)}
                                </span>
                            </span>
                            <span className="hidden max-w-[60%] shrink-0 items-center gap-3 overflow-hidden sm:flex">
                                {properties.map((property) => (
                                    <PropertyValueText
                                        key={property.id}
                                        property={property}
                                        value={row.values[property.id] ?? null}
                                        error={row.errors[property.id]}
                                    />
                                ))}
                            </span>
                        </button>
                    </li>
                ))}
            </ul>
            {rows.length === 0 && <p className="py-3 pl-1 text-sm text-muted-foreground">Keine Einträge in dieser Ansicht.</p>}
            {editable && onCreateEntry && (
                <button
                    type="button"
                    onClick={() => void onCreateEntry()}
                    className="flex h-8 w-full items-center gap-1.5 px-1 text-left text-sm text-muted-foreground hover:bg-accent/40 pointer-coarse:h-10"
                >
                    <Plus className="size-4" />
                    Neu
                </button>
            )}
        </div>
    );
}
