import { FileText, Plus, Table2 } from "lucide-react";
import { displayTitle } from "../page-display";
import type { Page, PageKind } from "../types";

/**
 * The subpages and databases of a database entry (package 23). Entries are
 * not in the sidebar, so their subpages are listed in the entry itself, as
 * Notion shows them in the text.
 */
export function SubpageList({
    subpages,
    onOpen,
    onCreate,
}: {
    subpages: Page[];
    onOpen: (pageId: string) => void;
    /** Undefined offline or without edit rights. */
    onCreate?: (kind: PageKind) => void;
}) {
    if (subpages.length === 0 && !onCreate) return null;

    return (
        <section className="mb-4 px-[var(--page-gutter)]" aria-label="Unterseiten">
            {subpages.length > 0 && (
                <ul className="mb-1 space-y-0.5">
                    {subpages.map((subpage) => (
                        <li key={subpage.id}>
                            <button
                                type="button"
                                onClick={() => onOpen(subpage.id)}
                                className="flex max-w-full items-center gap-2 rounded px-1.5 py-1 text-left text-sm hover:bg-accent pointer-coarse:py-2"
                            >
                                <span className="flex size-5 shrink-0 items-center justify-center" aria-hidden="true">
                                    {subpage.icon ??
                                        (subpage.kind === "database" ? (
                                            <Table2 className="size-4 text-muted-foreground" />
                                        ) : (
                                            <FileText className="size-4 text-muted-foreground" />
                                        ))}
                                </span>
                                <span className="truncate underline decoration-border underline-offset-4">
                                    {displayTitle(subpage)}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {onCreate && (
                <div className="flex flex-wrap gap-1 text-sm text-muted-foreground">
                    <button
                        type="button"
                        onClick={() => onCreate("page")}
                        className="flex items-center gap-1 rounded px-1.5 py-1 hover:bg-accent hover:text-foreground pointer-coarse:py-2"
                    >
                        <Plus className="size-4" aria-hidden="true" />
                        Unterseite
                    </button>
                    <button
                        type="button"
                        onClick={() => onCreate("database")}
                        className="flex items-center gap-1 rounded px-1.5 py-1 hover:bg-accent hover:text-foreground pointer-coarse:py-2"
                    >
                        <Plus className="size-4" aria-hidden="true" />
                        Datenbank
                    </button>
                </div>
            )}
        </section>
    );
}
