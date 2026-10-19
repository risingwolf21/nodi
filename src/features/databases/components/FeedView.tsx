import { FileText, Plus } from "lucide-react";
import { displayTitle } from "@/features/pages/page-display";
import type { DatabaseRow } from "../database-model";
import type { DatabaseProperty } from "../types";
import { PropertyValueText } from "./EntryCard";

type FeedViewProps = {
    rows: DatabaseRow[];
    properties: DatabaseProperty[];
    /** Start of each entry's text, per entry id. */
    previews: Record<string, string>;
    editable: boolean;
    onOpenEntry: (pageId: string) => void;
    /** Undefined: entries cannot be added here. */
    onCreateEntry?: () => Promise<void>;
};

const editedFormat = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric" });

/** Notion-like feed: entries one below the other with the start of their text. */
export function FeedView({ rows, properties, previews, editable, onOpenEntry, onCreateEntry }: FeedViewProps) {
    return (
        <div className="space-y-3 px-[var(--page-gutter)]">
            {editable && onCreateEntry && (
                <button
                    type="button"
                    onClick={() => void onCreateEntry()}
                    className="flex h-9 w-full items-center gap-1.5 rounded-md border border-dashed px-3 text-left text-sm text-muted-foreground hover:bg-accent/40"
                >
                    <Plus className="size-4" />
                    Neu
                </button>
            )}
            {rows.length === 0 && <p className="text-sm text-muted-foreground">Keine Einträge in dieser Ansicht.</p>}
            {rows.map((row) => {
                const edited = Date.parse(row.lastEditedAt);
                return (
                    <article key={row.page.id} className="rounded-md border">
                        <button
                            type="button"
                            onClick={() => onOpenEntry(row.page.id)}
                            className="flex w-full min-w-0 flex-col gap-2 p-4 text-left hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        >
                            <span className="flex min-w-0 items-center gap-2 text-base font-semibold">
                                <span className="flex size-6 shrink-0 items-center justify-center" aria-hidden="true">
                                    {row.page.icon ?? <FileText className="size-5 text-muted-foreground" />}
                                </span>
                                <span className={`truncate ${row.page.title ? "" : "text-muted-foreground"}`}>
                                    {displayTitle(row.page)}
                                </span>
                            </span>
                            {!Number.isNaN(edited) && (
                                <span className="text-xs text-muted-foreground">
                                    Zuletzt bearbeitet am {editedFormat.format(new Date(edited))}
                                </span>
                            )}
                            {properties.length > 0 && (
                                <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                                    {properties.map((property) => (
                                        <PropertyValueText
                                            key={property.id}
                                            property={property}
                                            value={row.values[property.id] ?? null}
                                            error={row.errors[property.id]}
                                        />
                                    ))}
                                </span>
                            )}
                            {previews[row.page.id] && (
                                <span className="line-clamp-4 whitespace-pre-line text-sm text-foreground/80">
                                    {previews[row.page.id]}
                                </span>
                            )}
                        </button>
                    </article>
                );
            })}
        </div>
    );
}
