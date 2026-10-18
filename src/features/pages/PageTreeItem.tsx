import { useState } from "react";
import { ChevronRight, FileText, MoreHorizontal, Plus } from "lucide-react";
import { Menu, MenuItem } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
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
}: PageTreeItemProps) {
    const children = pages.filter((item) => item.parent_id === page.id);
    const [expanded, setExpanded] = useState(true);
    const [menuOpen, setMenuOpen] = useState(false);
    const hasChildren = children.length > 0;
    const selected = selectedPageId === page.id;

    return (
        <div>
            <div
                className={cn(
                    "group flex h-7 items-center gap-0.5 rounded-md pr-1 text-sm pointer-coarse:h-10",
                    selected
                        ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                        : "hover:bg-sidebar-accent/70",
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
                    <ChevronRight
                        className={cn("size-3.5 transition-transform", expanded && "rotate-90")}
                    />
                </button>

                <button
                    type="button"
                    onClick={() => onSelect(page.id)}
                    aria-current={selected ? "page" : undefined}
                    className="flex min-w-0 flex-1 items-center gap-1.5 self-stretch text-left"
                >
                    <span className="flex size-5 shrink-0 items-center justify-center" aria-hidden="true">
                        {page.icon ?? <FileText className="size-4 text-muted-foreground" />}
                    </span>
                    <span className="truncate">{page.title}</span>
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
                    />
                ))}
        </div>
    );
}
