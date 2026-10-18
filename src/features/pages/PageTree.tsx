
import { PageTreeItem } from "./PageTreeItem";
import type { Page } from "./types";

type PageTreeProps = {
    pages: Page[];
    selectedPageId: string;
    /** Offline: no actions that need the server. */
    readOnly: boolean;
    onSelect: (pageId: string) => void;
    onAddChild: (parentId: string) => void;
    onRename: (page: Page) => void;
    onArchive: (page: Page) => void;
};

export function PageTree({
    pages,
    selectedPageId,
    readOnly,
    onSelect,
    onAddChild,
    onRename,
    onArchive
}: PageTreeProps) {
    const rootPages = pages.filter((page) => page.parent_id === null);

    if (rootPages.length === 0) {
        return (
            <p className="px-3 py-2 text-sm text-muted-foreground">
                Noch keine Seiten vorhanden.
            </p>
        );
    }

    return (
        <>
            {rootPages.map((page) => (
                <PageTreeItem
                    key={page.id}
                    page={page}
                    pages={pages}
                    selectedPageId={selectedPageId}
                    readOnly={readOnly}
                    onSelect={onSelect}
                    onAddChild={onAddChild}
                    onRename={onRename}
                    onArchive={onArchive}
                />
            ))}
        </>
    );
}
