import { useMemo, useState, type FormEvent } from "react";
import { CalendarDays, Columns3, LayoutGrid, List, Map as MapIcon, MapPin, Plus, Rss, Table2 } from "lucide-react";
import { Menu, MenuItem } from "@/components/ui/menu";
import type { Page } from "@/features/pages/types";
import { cn } from "@/lib/utils";
import {
    VIEW_TYPES,
    VIEW_TYPE_LABELS,
    applyView,
    buildRows,
    canGroupBy,
    dateProperty,
    defaultOptions,
    groupProperty,
    placeProperty,
    visibleProperties,
} from "../database-model";
import { useDatabase, type DatabaseBlockOptions, type NewEntryValue } from "../hooks/useDatabase";
import type { DatabaseView as DatabaseViewModel, ViewType } from "../types";
import { BoardView } from "./BoardView";
import { CalendarView } from "./CalendarView";
import { ConfirmDialog } from "./ConfirmDialog";
import { FeedView } from "./FeedView";
import { FormulaEditor } from "./FormulaEditor";
import { RollupEditor } from "./RollupEditor";
import { GalleryView } from "./GalleryView";
import { ListView } from "./ListView";
import { MapView } from "./MapView";
import { TableView } from "./TableView";
import { FilterPanel, PropertiesPanel, PropertyChoicePanel, SortPanel } from "./ViewSettingsPanels";

const VIEW_ICONS = {
    table: Table2,
    board: Columns3,
    list: List,
    gallery: LayoutGrid,
    feed: Rss,
    calendar: CalendarDays,
    map: MapIcon,
} satisfies Record<ViewType, unknown>;

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
    /** Databases of the workspace a relation can point to; undefined: no new relations here. */
    databases?: Page[];
    /** Shown as a block in a page: the block's own views (package 19c). */
    block?: DatabaseBlockOptions;
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
    const Icon = VIEW_ICONS[view.type];

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
                    active
                        ? "border-foreground font-medium"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                )}
            >
                <Icon className="size-3.5" aria-hidden="true" />
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
    databases,
    block,
}: DatabaseViewProps) {
    const {
        data,
        loading,
        error,
        fromCache,
        addProperty,
        addRelation,
        updateProperty,
        deleteProperty,
        addOption,
        addView,
        updateView,
        deleteView,
        setValue,
        createEntry,
    } = useDatabase(database.id, userId, onCreateEntry, block);
    const [activeViewId, setActiveViewId] = useState("");
    const [actionError, setActionError] = useState("");
    const [viewToDelete, setViewToDelete] = useState<DatabaseViewModel | null>(null);
    const [editedPropertyId, setEditedPropertyId] = useState("");
    const [addViewOpen, setAddViewOpen] = useState(false);

    const views = useMemo(() => [...(data?.views ?? [])].sort((a, b) => a.position - b.position), [data]);
    const activeView = views.find((view) => view.id === activeViewId) ?? views[0];
    const editable = !readOnly && !fromCache && data?.canEdit === true;
    // A block's views change with its page, the database's own with the database.
    const viewsEditable = block ? !readOnly && !fromCache && block.canEditViews : editable;

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

    async function addNewView(type: ViewType) {
        setAddViewOpen(false);
        try {
            const view = await addView(type);
            setActiveViewId(view.id);
        } catch (err) {
            report(err instanceof Error ? err.message : "Die Ansicht konnte nicht angelegt werden.");
        }
    }

    const columns = activeView ? visibleProperties(data.properties, activeView.config) : [];
    const formulaProperty = data.properties.find(
        (property) => property.id === editedPropertyId && property.type === "formula",
    );
    const rollupProperty = data.properties.find(
        (property) => property.id === editedPropertyId && property.type === "rollup",
    );
    const boardGroup = activeView?.type === "board" ? groupProperty(data.properties, activeView.config) : undefined;
    const calendarDate = activeView?.type === "calendar" ? dateProperty(data.properties, activeView.config) : undefined;
    const mapPlace = activeView?.type === "map" ? placeProperty(data.properties, activeView.config) : undefined;

    // Views other than the table open a new entry at once (like Notion); a
    // board column or a calendar day also sets its value.
    async function createAndOpenEntry(initial?: NewEntryValue) {
        try {
            const pageId = await createEntry(initial);
            if (pageId) onOpenEntry(pageId);
        } catch (err) {
            report(err instanceof Error ? err.message : "Der Eintrag konnte nicht angelegt werden.");
        }
    }

    return (
        <div className="space-y-2">
            {/* No overflow here: it would clip the menus of the tabs and the toolbar. */}
            <div className="flex flex-wrap items-center gap-1 px-[var(--page-gutter)]">
                <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Ansichten">
                    {views.map((view) => (
                        <ViewTab
                            key={view.id}
                            view={view}
                            active={view.id === activeView?.id}
                            editable={viewsEditable}
                            canDelete={views.length > 1}
                            onSelect={() => setActiveViewId(view.id)}
                            onRename={(name) => run(updateView(view.id, { name }))}
                            onDelete={() => setViewToDelete(view)}
                        />
                    ))}
                </div>
                {viewsEditable && (
                    <div className="relative shrink-0">
                        <button
                            type="button"
                            aria-label="Ansicht hinzufügen"
                            aria-expanded={addViewOpen}
                            onClick={() => setAddViewOpen(true)}
                            className="flex size-8 items-center justify-center rounded text-muted-foreground hover:bg-accent/60"
                        >
                            <Plus className="size-4" />
                        </button>
                        <Menu open={addViewOpen} onClose={() => setAddViewOpen(false)} align="start">
                            {VIEW_TYPES.map((type) => {
                                const Icon = VIEW_ICONS[type];
                                return (
                                    <MenuItem key={type} onSelect={() => void addNewView(type)}>
                                        <Icon className="size-4" aria-hidden="true" />
                                        {VIEW_TYPE_LABELS[type]}
                                    </MenuItem>
                                );
                            })}
                        </Menu>
                    </div>
                )}
                {activeView && (
                    <div className="ml-auto flex flex-wrap items-center gap-0.5">
                        {activeView.type === "board" && (
                            <PropertyChoicePanel
                                label="Gruppieren"
                                icon={Columns3}
                                emptyText="Keine Auswahl- oder Status-Eigenschaft."
                                choices={data.properties.filter((property) => canGroupBy(property.type))}
                                current={boardGroup}
                                editable={viewsEditable}
                                onChoose={(groupByPropertyId) =>
                                    updateView(activeView.id, { config: { ...activeView.config, groupByPropertyId } })
                                }
                                onError={report}
                            />
                        )}
                        {activeView.type === "map" && (
                            <PropertyChoicePanel
                                label="Ort"
                                icon={MapPin}
                                emptyText="Keine Orts-Eigenschaft."
                                choices={data.properties.filter((property) => property.type === "place")}
                                current={mapPlace}
                                editable={viewsEditable}
                                onChoose={(placePropertyId) =>
                                    updateView(activeView.id, { config: { ...activeView.config, placePropertyId } })
                                }
                                onError={report}
                            />
                        )}
                        {activeView.type === "calendar" && (
                            <PropertyChoicePanel
                                label="Datum"
                                icon={CalendarDays}
                                emptyText="Keine Datums-Eigenschaft."
                                choices={data.properties.filter((property) => property.type === "date")}
                                current={calendarDate}
                                editable={viewsEditable}
                                onChoose={(datePropertyId) =>
                                    updateView(activeView.id, { config: { ...activeView.config, datePropertyId } })
                                }
                                onError={report}
                            />
                        )}
                        <FilterPanel
                            config={activeView.config}
                            properties={data.properties}
                            editable={viewsEditable}
                            onChange={(config) => updateView(activeView.id, { config })}
                            onError={report}
                        />
                        <SortPanel
                            config={activeView.config}
                            properties={data.properties}
                            editable={viewsEditable}
                            onChange={(config) => updateView(activeView.id, { config })}
                            onError={report}
                        />
                        <PropertiesPanel
                            config={activeView.config}
                            properties={data.properties}
                            editable={viewsEditable}
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

            {activeView?.type === "board" && (
                <BoardView
                    rows={rows}
                    properties={columns}
                    groupBy={boardGroup}
                    editable={editable}
                    onOpenEntry={onOpenEntry}
                    onCreateEntry={
                        onCreateEntry && boardGroup
                            ? (optionId) => createAndOpenEntry({ propertyId: boardGroup.id, value: optionId })
                            : undefined
                    }
                    onMoveEntry={(pageId, optionId) => setValue(pageId, boardGroup?.id ?? "", optionId)}
                    onAddGroupProperty={async () => {
                        await addProperty("status");
                    }}
                    onError={report}
                />
            )}
            {activeView?.type === "list" && (
                <ListView
                    rows={rows}
                    properties={columns}
                    editable={editable}
                    onOpenEntry={onOpenEntry}
                    onCreateEntry={onCreateEntry ? () => createAndOpenEntry() : undefined}
                />
            )}
            {activeView?.type === "gallery" && (
                <GalleryView
                    rows={rows}
                    properties={columns}
                    editable={editable}
                    onOpenEntry={onOpenEntry}
                    onCreateEntry={onCreateEntry ? () => createAndOpenEntry() : undefined}
                />
            )}
            {activeView?.type === "feed" && (
                <FeedView
                    rows={rows}
                    properties={columns}
                    previews={data.documentPreview}
                    editable={editable}
                    onOpenEntry={onOpenEntry}
                    onCreateEntry={onCreateEntry ? () => createAndOpenEntry() : undefined}
                />
            )}
            {activeView?.type === "calendar" && (
                <CalendarView
                    rows={rows}
                    dateProperty={calendarDate}
                    editable={editable}
                    onOpenEntry={onOpenEntry}
                    onCreateEntry={
                        onCreateEntry && calendarDate
                            ? (day) =>
                                  createAndOpenEntry({ propertyId: calendarDate.id, value: { start: day, end: null } })
                            : undefined
                    }
                    onAddDateProperty={async () => {
                        await addProperty("date");
                    }}
                    onError={report}
                />
            )}
            {activeView?.type === "map" && (
                <MapView
                    rows={rows}
                    placeProperty={mapPlace}
                    editable={editable}
                    onOpenEntry={onOpenEntry}
                    onCreateEntry={onCreateEntry ? () => createAndOpenEntry() : undefined}
                    onAddPlaceProperty={async () => {
                        await addProperty("place");
                    }}
                    onError={report}
                />
            )}
            {activeView?.type === "table" && (
                <TableView
                    rows={rows}
                    properties={columns}
                    editable={editable}
                    onOpenEntry={onOpenEntry}
                    onRenameEntry={onRenameEntry}
                    onCreateEntry={onCreateEntry}
                    onSetValue={setValue}
                    onCreateOption={addOption}
                    relationTargets={databases?.map(({ id, title, icon }) => ({ id, title, icon }))}
                    onAddRelation={(target) => addRelation(target, database.title)}
                    onAddProperty={async (type) => {
                        const property = await addProperty(type);
                        // A new formula needs its expression first, a rollup its settings.
                        if (type === "formula" || type === "rollup") setEditedPropertyId(property.id);
                    }}
                    onEditFormula={setEditedPropertyId}
                    onRenameProperty={(propertyId, name) => updateProperty(propertyId, { name })}
                    onChangeNumberFormat={(propertyId, numberFormat) => updateProperty(propertyId, { numberFormat })}
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

            {formulaProperty && (
                <FormulaEditor
                    property={formulaProperty}
                    data={data}
                    sample={rows[0]?.page ?? entries[0]}
                    onClose={() => setEditedPropertyId("")}
                    onSave={(formula) => updateProperty(formulaProperty.id, { formula })}
                />
            )}
            {rollupProperty && (
                <RollupEditor
                    property={rollupProperty}
                    properties={data.properties}
                    onClose={() => setEditedPropertyId("")}
                    onSave={(rollup) => updateProperty(rollupProperty.id, { rollup })}
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
