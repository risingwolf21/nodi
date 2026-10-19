import { useState, type CSSProperties } from "react";
import { Table2 } from "lucide-react";
import type { DatabaseBlockContextValue } from "@/components/editor/database-block-context";
import { displayTitle } from "@/features/pages/page-display";
import type { Page } from "@/features/pages/types";
import { DatabaseView } from "./DatabaseView";

// More hits than this: the search narrows them down.
const MAX_CHOICES = 50;

// The block sits in the text column already; the views need no gutter of their own.
const NO_GUTTER = { "--page-gutter": "0px" } as CSSProperties;

function DatabaseIcon({ page }: { page: Page }) {
    return (
        <span className="flex size-5 shrink-0 items-center justify-center" aria-hidden="true">
            {page.icon ?? <Table2 className="size-4 text-muted-foreground" />}
        </span>
    );
}

function DatabasePicker({ databases, onChoose }: { databases: Page[]; onChoose: (databaseId: string) => void }) {
    const [query, setQuery] = useState("");
    const needle = query.trim().toLocaleLowerCase("de");
    const choices = databases
        .filter((database) => displayTitle(database).toLocaleLowerCase("de").includes(needle))
        .slice(0, MAX_CHOICES);

    return (
        <div className="space-y-2 rounded-md border p-3" role="group" aria-label="Datenbank wählen">
            <p className="text-sm font-medium">Welche Datenbank soll hier stehen?</p>
            <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Datenbank suchen"
                aria-label="Datenbank suchen"
                className="h-8 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
            <ul className="max-h-60 space-y-0.5 overflow-y-auto">
                {choices.map((database) => (
                    <li key={database.id}>
                        <button
                            type="button"
                            onClick={() => onChoose(database.id)}
                            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent pointer-coarse:py-2.5"
                        >
                            <DatabaseIcon page={database} />
                            <span className="truncate">{displayTitle(database)}</span>
                        </button>
                    </li>
                ))}
                {choices.length === 0 && (
                    <li className="px-2 py-1 text-sm text-muted-foreground">
                        {databases.length === 0
                            ? "Dieser Workspace hat noch keine Datenbank. Lege zuerst eine an."
                            : "Nichts gefunden."}
                    </li>
                )}
            </ul>
        </div>
    );
}

/** A database block: first the choice of a database, then its title and the block's views. */
export function DatabaseBlockContent({
    context,
    blockId,
    databaseId,
    onChoose,
}: {
    context: DatabaseBlockContextValue;
    blockId: string;
    databaseId: string;
    onChoose: (databaseId: string) => void;
}) {
    if (!databaseId) {
        return context.canEditPage ? (
            <DatabasePicker databases={context.databases} onChoose={onChoose} />
        ) : (
            <p className="text-sm text-muted-foreground">Hier wurde noch keine Datenbank gewählt.</p>
        );
    }

    const database = context.pages.find((page) => page.id === databaseId && page.kind === "database");
    if (!database) {
        return (
            <p className="text-sm text-muted-foreground">
                Diese Datenbank ist nicht verfügbar: Sie ist im Papierkorb, gelöscht oder nicht für dich freigegeben.
            </p>
        );
    }

    const { onCreateEntry } = context;
    // Entries are created in the database's own workspace only (as on its page).
    const canCreateEntries = onCreateEntry && context.databases.some((page) => page.id === database.id);

    return (
        <div className="space-y-2" style={NO_GUTTER}>
            <button
                type="button"
                onClick={() => context.onOpenPage(database.id)}
                className="-ml-1 flex max-w-full items-center gap-1.5 rounded px-1 py-0.5 text-lg font-semibold hover:bg-accent"
                title="Datenbank öffnen"
            >
                <DatabaseIcon page={database} />
                <span className="truncate">{displayTitle(database)}</span>
            </button>
            <DatabaseView
                database={database}
                entries={context.pages.filter((page) => page.parent_id === database.id)}
                userId={context.userId}
                readOnly={context.readOnly}
                onOpenEntry={context.onOpenPage}
                onCreateEntry={canCreateEntries ? () => onCreateEntry(database.id) : undefined}
                onRenameEntry={context.onRenameEntry}
                databases={context.databases}
                block={{ pageId: context.pageId, blockId, canEditViews: context.canEditPage }}
            />
        </div>
    );
}
