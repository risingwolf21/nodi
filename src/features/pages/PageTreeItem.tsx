import { useState, type DragEvent } from "react";
import { ChevronRight, FileText, MoreHorizontal, Plus, Table2 } from "lucide-react";
import { Menu, MenuItem } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import { displayTitle } from "./page-display";
import { compareByPosition } from "./page-hierarchy";
import type { TreeDragAndDrop } from "./PageTree";
import type { Page } from "./types";

type PageTreeItemProps = {
    page: Page;
    pages: Page[];
    depth: number;
    selectedPageId: string;
    readOnly: boolean;
    onSelect: (pageId: string) => void;
    onAddChild: (parentId: string) => void;
    onRename: (page: Page) => void;
    onArchive: (page: Page) => void;
    onMove?: (page: Page) => void;
    dragAndDrop?: TreeDragAndDrop;
};

// Indentation per tree level, in pixels.
const INDENT = 14;

const actionButton =
    "flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-sidebar-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:size-8 pointer-coarse:opacity-100";

export function PageTreeItem({
    page,
    pages,
    depth,
    selectedPageId,
    readOnly,
    onSelect,
    onAddChild,
    onRename,
    onArchive,
    onMove,
    dragAndDrop,
}: PageTreeItemProps) {
    const children = pages.filter((item) => item.parent_id === page.id).sort(compareByPosition);
    const [expanded, setExpanded] = useState(true);
    const [menuOpen, setMenuOpen] = useState(false);
    // Where a dragged page would land: before or after this one, or below it.
    const [dropHere, setDropHere] = useState<"before" | "into" | "after" | null>(null);
    const dragging = () => dragAndDrop?.draggedId !== null && dragAndDrop?.draggedId !== page.id;
    const zone = (event: DragEvent<HTMLElement>): "before" | "into" | "after" | null => {
        if (!dragAndDrop || !dragging()) return null;
        const rect = event.currentTarget.getBoundingClientRect();
        const offset = (event.clientY - rect.top) / rect.height;
        const edge = offset < 0.25 ? "before" : offset > 0.75 ? "after" : null;
        if (edge && dragAndDrop.canPlace(page)) return edge;
        return dragAndDrop.canDrop({ parentId: page.id }) ? "into" : null;
    };
    const hasChildren = children.length > 0;
    const selected = selectedPageId === page.id;

    return (
        <div>
            <div
                draggable={dragAndDrop !== undefined}
                onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", displayTitle(page));
                    dragAndDrop?.start(page.id);
                }}
                onDragEnd={() => dragAndDrop?.end()}
                onDragOver={(event) => {
                    const where = zone(event);
                    setDropHere(where);
                    if (!where) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                }}
                onDragLeave={() => setDropHere(null)}
                onDrop={(event) => {
                    event.preventDefault();
                    const where = zone(event);
                    setDropHere(null);
                    if (where === "into") dragAndDrop?.drop({ parentId: page.id });
                    else if (where) dragAndDrop?.place(page, where);
                }}
                className={cn(
                    "group flex h-7 items-center gap-0.5 rounded-md pr-1 text-sm pointer-coarse:h-10",
                    selected
                        ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                        : "hover:bg-sidebar-accent/70",
                    dropHere === "into" && "ring-2 ring-brand",
                    dropHere === "before" && "shadow-[inset_0_2px_0_var(--brand)]",
                    dropHere === "after" && "shadow-[inset_0_-2px_0_var(--brand)]",
                    dragAndDrop?.draggedId === page.id && "opacity-50",
                )}
                style={{ paddingLeft: 4 + depth * INDENT }}
            >
                <button
                    type="button"
                    aria-label={expanded ? "Unterseiten einklappen" : "Unterseiten ausklappen"}
                    aria-expanded={hasChildren ? expanded : undefined}
                    disabled={!hasChildren}
                    onClick={() => setExpanded((value) => !value)}
                    className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent disabled:opacity-0 pointer-coarse:size-8"
                >
                    <ChevronRight className={cn("size-3.5 transition-transform", expanded && "rotate-90")} />
                </button>

                <button
                    type="button"
                    onClick={() => onSelect(page.id)}
                    aria-current={selected ? "page" : undefined}
                    className="flex min-w-0 flex-1 items-center gap-1.5 self-stretch text-left"
                >
                    <span className="flex size-5 shrink-0 items-center justify-center" aria-hidden="true">
                        {page.icon ??
                            (page.kind === "database" ? (
                                <Table2 className="size-4 text-muted-foreground" />
                            ) : (
                                <FileText className="size-4 text-muted-foreground" />
                            ))}
                    </span>
                    <span className="truncate">{displayTitle(page)}</span>
                    {page.is_template && (
                        <span className="shrink-0 rounded bg-muted px-1 text-[0.7rem] text-muted-foreground">
                            Vorlage
                        </span>
                    )}
                </button>

                {!readOnly && (
                    <>
                        <div className="relative shrink-0">
                            <button
                                type="button"
                                title="Seitenaktionen"
                                aria-label={`Aktionen für ${page.title}`}
                                aria-expanded={menuOpen}
                                onClick={() => setMenuOpen((value) => !value)}
                                className={cn(actionButton, menuOpen && "opacity-100")}
                            >
                                <MoreHorizontal className="size-4" />
                            </button>

                            <Menu open={menuOpen} onClose={() => setMenuOpen(false)}>
                                <MenuItem
                                    onSelect={() => {
                                        setMenuOpen(false);
                                        onRename(page);
                                    }}
                                >
                                    Umbenennen
                                </MenuItem>
                                {onMove && (
                                    <MenuItem
                                        onSelect={() => {
                                            setMenuOpen(false);
                                            onMove(page);
                                        }}
                                    >
                                        Verschieben nach …
                                    </MenuItem>
                                )}
                                <MenuItem
                                    destructive
                                    onSelect={() => {
                                        setMenuOpen(false);
                                        onArchive(page);
                                    }}
                                >
                                    In den Papierkorb
                                </MenuItem>
                            </Menu>
                        </div>

                        {/* Entries of a database are added in the database itself. */}
                        {page.kind !== "database" && (
                            <button
                                type="button"
                                title="Unterseite hinzufügen"
                                aria-label={`Unterseite zu ${page.title} erstellen`}
                                onClick={() => {
                                    setExpanded(true);
                                    onAddChild(page.id);
                                }}
                                className={actionButton}
                            >
                                <Plus className="size-4" />
                            </button>
                        )}
                    </>
                )}
            </div>

            {expanded &&
                children.map((child) => (
                    <PageTreeItem
                        key={child.id}
                        page={child}
                        pages={pages}
                        depth={depth + 1}
                        selectedPageId={selectedPageId}
                        readOnly={readOnly}
                        onSelect={onSelect}
                        onAddChild={onAddChild}
                        onRename={onRename}
                        onArchive={onArchive}
                        onMove={onMove}
                        dragAndDrop={dragAndDrop}
                    />
                ))}
        </div>
    );
}
