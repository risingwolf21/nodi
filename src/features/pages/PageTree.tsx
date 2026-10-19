import type { MoveTarget } from "./page-hierarchy";
import { PageTreeItem } from "./PageTreeItem";
import type { Page } from "./types";

/** Dragging pages in the sidebar (mouse); the sidebar decides what may be dropped where. */
export type TreeDragAndDrop = {
    draggedId: string | null;
    canDrop: (target: MoveTarget) => boolean;
    start: (pageId: string) => void;
    end: () => void;
    drop: (target: MoveTarget) => void;
};

type PageTreeProps = {
    pages: Page[];
    selectedPageId: string;
    /** Offline: no actions that need the server. */
    readOnly: boolean;
    onSelect: (pageId: string) => void;
    onAddChild: (parentId: string) => void;
    onRename: (page: Page) => void;
    onArchive: (page: Page) => void;
    /** "Verschieben nach …"; undefined: not offered. */
    onMove?: (page: Page) => void;
    dragAndDrop?: TreeDragAndDrop;
    emptyText?: string;
};

export function PageTree({
    pages,
    selectedPageId,
    readOnly,
    onSelect,
    onAddChild,
    onRename,
    onArchive,
    onMove,
    dragAndDrop,
    emptyText = "Noch keine Seiten",
}: PageTreeProps) {
    const rootPages = pages.filter((page) => page.parent_id === null);

    if (rootPages.length === 0) {
        return <p className="px-2 py-1 text-sm text-muted-foreground">{emptyText}</p>;
    }

    return (
        <>
            {rootPages.map((page) => (
                <PageTreeItem
                    key={page.id}
                    page={page}
                    pages={pages}
                    depth={0}
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
        </>
    );
}
