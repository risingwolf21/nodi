import { useState, type KeyboardEvent } from "react";
import { FileText, Maximize2, Plus } from "lucide-react";
import { displayTitle } from "@/features/pages/page-display";
import type { DatabaseRow } from "../database-model";
import type { DatabaseProperty, PropertyOption, PropertyType, PropertyValue } from "../types";
import { AddPropertyButton } from "./AddPropertyButton";
import { PropertyHeader } from "./PropertyHeader";
import { PropertyValueEditor } from "./PropertyValueEditor";

export type TableViewProps = {
    rows: DatabaseRow[];
    /** Visible columns, in order. */
    properties: DatabaseProperty[];
    /** Values, properties and titles can be changed (online, with edit rights). */
    editable: boolean;
    onOpenEntry: (pageId: string) => void;
    onRenameEntry: (pageId: string, title: string) => Promise<void>;
    /** Returns the new entry, whose name gets the focus; undefined: no "Neu". */
    onCreateEntry?: () => Promise<string>;
    onSetValue: (pageId: string, propertyId: string, value: PropertyValue) => Promise<void>;
    onCreateOption: (propertyId: string, name: string) => Promise<PropertyOption>;
    onAddProperty: (type: PropertyType) => Promise<void>;
    onRenameProperty: (propertyId: string, name: string) => Promise<void>;
    onChangePropertyType: (propertyId: string, type: PropertyType) => Promise<void>;
    onHideProperty: (propertyId: string) => Promise<void>;
    onDeleteProperty: (propertyId: string) => Promise<void>;
    onEditFormula: (propertyId: string) => void;
    onError: (message: string) => void;
};

function TitleCell({
    row,
    editable,
    startEditing,
    onOpen,
    onRename,
    onError,
}: {
    row: DatabaseRow;
    editable: boolean;
    startEditing: boolean;
    onOpen: () => void;
    onRename: (title: string) => Promise<void>;
    onError: (message: string) => void;
}) {
    const [draft, setDraft] = useState<string | null>(startEditing ? row.page.title : null);

    function commit() {
        if (draft === null) return;
        const next = draft.trim();
        setDraft(null);
        if (next === row.page.title) return;
        onRename(next).catch((err: unknown) =>
            onError(err instanceof Error ? err.message : "Der Name konnte nicht gespeichert werden."),
        );
    }

    function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
            event.preventDefault();
            setDraft(null);
        }
    }

    return (
        <div className="group/title flex min-w-0 items-center gap-1 pr-1">
            <span className="flex size-6 shrink-0 items-center justify-center" aria-hidden="true">
                {row.page.icon ?? <FileText className="size-4 text-muted-foreground" />}
            </span>
            {draft !== null ? (
                <input
                    autoFocus
                    value={draft}
                    placeholder="Ohne Titel"
                    aria-label="Name"
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={commit}
                    onKeyDown={onKeyDown}
                    className="h-8 min-w-0 flex-1 rounded bg-background px-1 text-sm font-medium outline-none ring-2 ring-ring/50"
                />
            ) : (
                <button
                    type="button"
                    disabled={!editable}
                    onClick={() => setDraft(row.page.title)}
                    className={`h-8 min-w-0 flex-1 truncate rounded px-1 text-left text-sm font-medium hover:bg-accent/60 disabled:hover:bg-transparent ${row.page.title ? "" : "text-muted-foreground"}`}
                >
                    {displayTitle(row.page)}
                </button>
            )}
            <button
                type="button"
                onClick={onOpen}
                aria-label={`${displayTitle(row.page)} öffnen`}
                className="flex h-6 shrink-0 items-center gap-1 rounded border bg-background px-1.5 text-xs text-muted-foreground opacity-0 group-hover/title:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 hover:text-foreground"
            >
                <Maximize2 className="size-3" />
                Öffnen
            </button>
        </div>
    );
}

/** Notion-like table: one row per entry, one column per visible property. */
export function TableView({
    rows,
    properties,
    editable,
    onOpenEntry,
    onRenameEntry,
    onCreateEntry,
    onSetValue,
    onCreateOption,
    onAddProperty,
    onRenameProperty,
    onChangePropertyType,
    onHideProperty,
    onDeleteProperty,
    onEditFormula,
    onError,
}: TableViewProps) {
    const [newEntryId, setNewEntryId] = useState("");
    const [creating, setCreating] = useState(false);

    async function createEntry() {
        if (creating || !onCreateEntry) return;
        setCreating(true);
        try {
            setNewEntryId(await onCreateEntry());
        } catch (err) {
            onError(err instanceof Error ? err.message : "Der Eintrag konnte nicht angelegt werden.");
        } finally {
            setCreating(false);
        }
    }

    return (
        <div className="overflow-x-auto px-[var(--page-gutter)]">
            <table className="w-max min-w-full border-collapse text-sm">
                <thead>
                    <tr className="border-y">
                        <th scope="col" className="w-64 min-w-64 border-r p-0 text-left">
                            <span className="flex h-8 items-center px-2 text-xs font-medium text-muted-foreground">
                                Name
                            </span>
                        </th>
                        {properties.map((property) => (
                            <th key={property.id} scope="col" className="w-48 min-w-48 border-r p-0 text-left font-normal">
                                <PropertyHeader
                                    property={property}
                                    editable={editable}
                                    onRename={(name) => onRenameProperty(property.id, name)}
                                    onChangeType={(type) => onChangePropertyType(property.id, type)}
                                    onHide={() => onHideProperty(property.id)}
                                    onDelete={() => onDeleteProperty(property.id)}
                                    onEditFormula={() => onEditFormula(property.id)}
                                    onError={onError}
                                />
                            </th>
                        ))}
                        <th scope="col" className="p-0 text-left">
                            {editable && <AddPropertyButton onAdd={onAddProperty} onError={onError} />}
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.page.id} className="border-b hover:bg-accent/30">
                            <td className="border-r p-0 align-top">
                                <TitleCell
                                    key={row.page.id === newEntryId ? `${row.page.id}-new` : row.page.id}
                                    row={row}
                                    editable={editable}
                                    startEditing={row.page.id === newEntryId}
                                    onOpen={() => onOpenEntry(row.page.id)}
                                    onRename={(title) => onRenameEntry(row.page.id, title)}
                                    onError={onError}
                                />
                            </td>
                            {properties.map((property) => (
                                <td key={property.id} className="max-w-48 border-r p-0 align-top">
                                    <PropertyValueEditor
                                        property={property}
                                        value={row.values[property.id] ?? null}
                                        editable={editable}
                                        onChange={(value) => onSetValue(row.page.id, property.id, value)}
                                        onCreateOption={(name) => onCreateOption(property.id, name)}
                                        onError={onError}
                                        alignNumbersRight
                                        error={row.errors[property.id]}
                                    />
                                </td>
                            ))}
                            <td />
                        </tr>
                    ))}
                </tbody>
            </table>
            {rows.length === 0 && (
                <p className="py-3 pl-2 text-sm text-muted-foreground">Keine Einträge in dieser Ansicht.</p>
            )}
            {editable && onCreateEntry && (
                <button
                    type="button"
                    disabled={creating}
                    onClick={() => void createEntry()}
                    className="flex h-8 w-full items-center gap-1.5 border-b px-2 text-left text-sm text-muted-foreground hover:bg-accent/40 pointer-coarse:h-10"
                >
                    <Plus className="size-4" />
                    Neu
                </button>
            )}
        </div>
    );
}
