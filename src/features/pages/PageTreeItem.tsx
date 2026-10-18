
import { useState } from "react";
import type { Page } from "./types";

type PageTreeItemProps = {
    page: Page;
    pages: Page[];
    selectedPageId: string;
    readOnly: boolean;
    onSelect: (pageId: string) => void;
    onAddChild: (parentId: string) => void;
    onRename: (page: Page) => void;
    onArchive: (page: Page) => void;
};

export function PageTreeItem({
    page,
    pages,
    selectedPageId,
    readOnly,
    onRename,
    onArchive,
    onSelect,
    onAddChild,
}: PageTreeItemProps) {
    const children = pages.filter((item) => item.parent_id === page.id);
    const [expanded, setExpanded] = useState(true);
    const hasChildren = children.length > 0;
    const [menuOpen, setMenuOpen] = useState(false);

    return (
        <div>
            <div
                className={`group flex items-center gap-1 rounded-md pr-1 ${selectedPageId === page.id
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-muted"
                    }`}
                style={{ paddingLeft: "4px" }}
            >
                <button
                    type="button"
                    aria-label={
                        expanded ? "Unterseiten einklappen" : "Unterseiten ausklappen"
                    }
                    aria-expanded={expanded}
                    onClick={() => setExpanded((value) => !value)}
                    className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background pointer-coarse:size-9"
                >
                    {hasChildren ? (expanded ? "▾" : "▸") : "·"}
                </button>

                <button
                    type="button"
                    onClick={() => onSelect(page.id)}
                    className="min-w-0 flex-1 truncate py-2 text-left text-sm"
                >
                    {page.title}
                </button>

                {!readOnly && (
                    <>
                        <button
                            type="button"
                            aria-label={`Unterseite zu ${page.title} erstellen`}
                            title="Unterseite erstellen"
                            onClick={() => onAddChild(page.id)}
                            className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-background hover:text-foreground group-hover:opacity-100 focus:opacity-100 pointer-coarse:size-9 pointer-coarse:opacity-100"
                        >
                            +
                        </button>


                        <div className="relative shrink-0">
                            <button
                                type="button"
                                title="Seitenaktionen"
                                aria-label={`Aktionen für ${page.title}`}
                                aria-expanded={menuOpen}
                                onClick={() => setMenuOpen((value) => !value)}
                                className="flex size-7 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-background hover:text-foreground group-hover:opacity-100 focus:opacity-100 pointer-coarse:size-9 pointer-coarse:opacity-100"
                            >
                                …
                            </button>

                            {menuOpen && (
                                <div className="absolute right-0 top-full z-20 min-w-36 rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setMenuOpen(false);
                                            onRename(page);
                                        }}
                                        className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-accent"
                                    >
                                        Umbenennen
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setMenuOpen(false);
                                            onArchive(page);
                                        }}
                                        className="block w-full rounded px-3 py-2 text-left text-sm text-destructive hover:bg-accent"
                                    >
                                        Archivieren
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                )}

            </div>

            {expanded &&
                children.map((child) => (
                    <div key={child.id} style={{ paddingLeft: "14px" }}>
                        <PageTreeItem
                            page={child}
                            pages={pages}
                            selectedPageId={selectedPageId}
                            readOnly={readOnly}
                            onSelect={onSelect}
                            onAddChild={onAddChild}
                            onRename={onRename}
                            onArchive={onArchive}
                        />
                    </div>
                ))}
        </div>
    );
}
