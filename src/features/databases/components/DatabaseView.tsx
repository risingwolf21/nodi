import { useMemo, useState, type FormEvent } from "react";
import { Plus, Table2 } from "lucide-react";
import { Menu, MenuItem } from "@/components/ui/menu";
import type { Page } from "@/features/pages/types";
import { cn } from "@/lib/utils";
import {
    AVAILABLE_VIEW_TYPES,
    VIEW_TYPE_LABELS,
    applyView,
    buildRows,
    defaultOptions,
    visibleProperties,
} from "../database-model";
import { useDatabase } from "../hooks/useDatabase";
import type { DatabaseView as DatabaseViewModel } from "../types";
import { ConfirmDialog } from "./ConfirmDialog";
import { TableView } from "./TableView";
import { FilterPanel, PropertiesPanel, SortPanel } from "./ViewSettingsPanels";

type DatabaseViewProps = {
    database: Page;
    /** Pages below the database, from the page tree. */
    entries: Page[];
    userId: string | undefined;
    /** The page tree is a cached copy (offline). */
    readOnly: boolean;
    onOpenEntry: (pageId: string) => void;
    /** Adds an entry and returns its id; undefined when entries cannot be added here. */
    onCreateEntry?: () => Promise<string>;
    onRenameEntry: (pageId: string, title: string) => Promise<void>;
};

function ViewTab({
    view,
    active,
    editable,
    canDelete,
    onSelect,
    onRename,
    onDelete,
}: {
    view: DatabaseViewModel;
    active: boolean;
    editable: boolean;
    canDelete: boolean;
    onSelect: () => void;
    onRename: (name: string) => Promise<void>;
    onDelete: () => void;
}) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [name, setName] = useState(view.name);

    function rename(event?: FormEvent<HTMLFormElement>) {
        event?.preventDefault();
        const next = name.trim();
        setMenuOpen(false);
        if (next && next !== view.name) void onRename(next);
    }

    return (
        <div className="relative shrink-0">
            <button
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                    if (active && editable) {
                        setName(view.name);
                        setMenuOpen(true);
                    } else {
                        onSelect();
                    }
                }}
                className={cn(
                    "flex h-8 items-center gap-1.5 border-b-2 px-2 text-sm pointer-coarse:h-10",
                    active ? "border-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
            >
                <Table2 className="size-3.5" aria-hidden="true" />
                {view.name}
            </button>
            <Menu open={menuOpen} onClose={() => rename()} align="start" className="w-56">
                <form onSubmit={rename} className="p-1">
                    <input
                        autoFocus
                        value={name}
                        maxLength={100}
                        aria-label="Name der Ansicht"
                        onChange={(event) => setName(event.target.value)}
                        className="h-7 w-full rounded border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    />
                </form>
                {canDelete && (
                    <MenuItem
                        destructive
                        onSelect={() => {
                            setMenuOpen(false);
                            onDelete();
                        }}
                    >
                        Ansicht löschen
                    </MenuItem>
                )}
            </Menu>
        </div>
    );
}

/**
 * A database page: tabs with its views, filter and sort, and the active view.
 * Changes need the server (CLAUDE.md §12 P14); offline everything is read-only.
 */
export function DatabaseView({
    database,
    entries,
    userId,
    readOnly,
    onOpenEntry,
    onCreateEntry,
    onRenameEntry,
}: DatabaseViewProps) {
    const {
        data,
        loading,
        error,
        fromCache,
        addProperty,
        updateProperty,
        deleteProperty,
        addOption,
        addView,
        updateView,
        deleteView,
        setValue,
    } = useDatabase(database.id, userId);
    const [activeViewId, setActiveViewId] = useState("");
    const [actionError, setActionError] = useState("");
    const [viewToDelete, setViewToDelete] = useState<DatabaseViewModel | null>(null);
    const [addViewOpen, setAddViewOpen] = useState(false);

    const views = useMemo(() => [...(data?.views ?? [])].sort((a, b) => a.position - b.position), [data]);
    const activeView = views.find((view) => view.id === activeViewId) ?? views[0];
    const editable = !readOnly && !fromCache && data?.canEdit === true;

    const rows = useMemo(
        () => (data && activeView ? applyView(buildRows(entries, data), activeView.config, data.properties) : []),
        [data, activeView, entries],
    );

    if (!data) {
        return (
            <p className="px-[var(--page-gutter)] text-sm text-muted-foreground" role={error ? "alert" : undefined}>
                {error || (loading ? "Datenbank wird geladen …" : "")}
            </p>
        );
    }

    const report = (message: string) => setActionError(message);
    const run = (action: Promise<void>): Promise<void> =>
        action.catch((err: unknown) => report(err instanceof Error ? err.message : "Das hat nicht geklappt."));

    async function addNewView() {
        setAddViewOpen(false);
        try {
            const view = await addView("table");
            setActiveViewId(view.id);
        } catch (err) {
            report(err instanceof Error ? err.message : "Die Ansicht konnte nicht angelegt werden.");
        }
    }

    const columns = activeView ? visibleProperties(data.properties, activeView.config) : [];

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-1 overflow-x-auto px-[var(--page-gutter)]" role="tablist" aria-label="Ansichten">
                {views.map((view) => (
                    <ViewTab
                        key={view.id}
                        view={view}
                        active={view.id === activeView?.id}
                        editable={editable}
                        canDelete={views.length > 1}
                        onSelect={() => setActiveViewId(view.id)}
                        onRename={(name) => run(updateView(view.id, { name }))}
                        onDelete={() => setViewToDelete(view)}
                    />
                ))}
                {editable && (
                    <div className="relative shrink-0">
                        <button
                            type="button"
                            aria-label="Ansicht hinzufügen"
                            aria-expanded={addViewOpen}
                            onClick={() =>
                                AVAILABLE_VIEW_TYPES.length === 1 ? void addNewView() : setAddViewOpen(true)
                            }
                            className="flex size-8 items-center justify-center rounded text-muted-foreground hover:bg-accent/60"
                        >
                            <Plus className="size-4" />
                        </button>
                        <Menu open={addViewOpen} onClose={() => setAddViewOpen(false)} align="start">
                            {AVAILABLE_VIEW_TYPES.map((type) => (
                                <MenuItem key={type} onSelect={() => void addNewView()}>
                                    {VIEW_TYPE_LABELS[type]}
                                </MenuItem>
                            ))}
                        </Menu>
                    </div>
                )}
                {activeView && (
                    <div className="ml-auto flex shrink-0 items-center gap-0.5">
                        <FilterPanel
                            config={activeView.config}
                            properties={data.properties}
                            editable={editable}
                            onChange={(config) => updateView(activeView.id, { config })}
                            onError={report}
                        />
                        <SortPanel
                            config={activeView.config}
                            properties={data.properties}
                            editable={editable}
                            onChange={(config) => updateView(activeView.id, { config })}
                            onError={report}
                        />
                        <PropertiesPanel
                            config={activeView.config}
                            properties={data.properties}
                            editable={editable}
                            onChange={(config) => updateView(activeView.id, { config })}
                            onError={report}
                        />
                    </div>
                )}
            </div>

            {(actionError || (fromCache && !readOnly)) && (
                <p
                    className={cn(
                        "px-[var(--page-gutter)] text-sm",
                        actionError ? "text-destructive" : "text-muted-foreground",
                    )}
                    role={actionError ? "alert" : "status"}
                >
                    {actionError || "Offline: Die Datenbank ist nur lesbar."}
                    {actionError && (
                        <button type="button" onClick={() => setActionError("")} className="ml-2 underline">
                            Schließen
                        </button>
                    )}
                </p>
            )}

            {activeView && (
                <TableView
                    rows={rows}
                    properties={columns}
                    editable={editable}
                    onOpenEntry={onOpenEntry}
                    onRenameEntry={onRenameEntry}
                    onCreateEntry={onCreateEntry}
                    onSetValue={setValue}
                    onCreateOption={addOption}
                    onAddProperty={async (type) => {
                        await addProperty(type);
                    }}
                    onRenameProperty={(propertyId, name) => updateProperty(propertyId, { name })}
                    onChangePropertyType={(propertyId, type) =>
                        updateProperty(propertyId, { type, options: defaultOptions(type) })
                    }
                    onHideProperty={(propertyId) =>
                        updateView(activeView.id, {
                            config: {
                                ...activeView.config,
                                hiddenPropertyIds: [...activeView.config.hiddenPropertyIds, propertyId],
                            },
                        })
                    }
                    onDeleteProperty={deleteProperty}
                    onError={report}
                />
            )}

            {viewToDelete && (
                <ConfirmDialog
                    title="Ansicht löschen?"
                    message={`„${viewToDelete.name}“ wird für alle gelöscht. Die Einträge bleiben erhalten.`}
                    confirmLabel="Löschen"
                    onCancel={() => setViewToDelete(null)}
                    onConfirm={async () => {
                        await deleteView(viewToDelete.id);
                        setViewToDelete(null);
                    }}
                />
            )}
        </div>
    );
}
