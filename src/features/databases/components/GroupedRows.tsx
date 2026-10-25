import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RowGroup } from "../database-model";
import type { DatabaseProperty } from "../types";
import { OptionBadge } from "./OptionBadge";

const NO_VALUE_GROUP = "none";

/**
 * A table or list grouped by a select or status property (package 32c): one
 * section per option with entries, like Notion; each can be folded.
 */
export function GroupedRows({
    groups,
    property,
    children,
}: {
    groups: RowGroup[];
    property: DatabaseProperty;
    /** The view for the rows of one group. */
    children: (group: RowGroup) => ReactNode;
}) {
    // Folded groups, only in this tab.
    const [folded, setFolded] = useState<Set<string>>(() => new Set());
    const shown = groups.filter((group) => group.rows.length > 0);

    if (shown.length === 0) {
        return <p className="px-[var(--page-gutter)] py-4 text-sm text-muted-foreground">Keine Einträge.</p>;
    }

    return (
        <div className="space-y-4">
            {shown.map((group) => {
                const key = group.option?.id ?? NO_VALUE_GROUP;
                const label = group.option?.name ?? `Ohne ${property.name}`;
                const open = !folded.has(key);
                return (
                    <section key={key} aria-label={`Gruppe ${label}`}>
                        <button
                            type="button"
                            aria-expanded={open}
                            onClick={() =>
                                setFolded((current) => {
                                    const next = new Set(current);
                                    if (open) next.add(key);
                                    else next.delete(key);
                                    return next;
                                })
                            }
                            className="mx-[var(--page-gutter)] mb-1 flex h-7 items-center gap-1.5 rounded px-1 text-sm hover:bg-accent/60 pointer-coarse:h-10"
                        >
                            <ChevronRight
                                className={cn(
                                    "size-3.5 text-muted-foreground transition-transform",
                                    open && "rotate-90",
                                )}
                                aria-hidden="true"
                            />
                            {group.option ? <OptionBadge option={group.option} /> : <span>{label}</span>}
                            <span className="text-xs text-muted-foreground">{group.rows.length}</span>
                        </button>
                        {open && children(group)}
                    </section>
                );
            })}
        </div>
    );
}
