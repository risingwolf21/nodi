import { useEffect, useState } from "react";
import { CornerDownRight } from "lucide-react";
import { displayTitle } from "../page-display";
import { loadBacklinks } from "../services/page-links";
import type { Page } from "../types";

/**
 * "Verlinkt von": the pages whose text links this one (package 28). Online
 * only; pages the app cannot open are left out.
 */
export function Backlinks({
    pageId,
    knownPages,
    online,
    onOpen,
}: {
    pageId: string;
    knownPages: Page[];
    online: boolean;
    onOpen: (pageId: string) => void;
}) {
    const [linkingIds, setLinkingIds] = useState<{ pageId: string; ids: string[] } | null>(null);

    useEffect(() => {
        if (!online) return;
        let current = true;
        loadBacklinks(pageId)
            .then((ids) => {
                if (current) setLinkingIds({ pageId, ids });
            })
            .catch((err: unknown) => console.error("Rückverweise konnten nicht geladen werden:", err));
        return () => {
            current = false;
        };
    }, [pageId, online]);

    const linking = linkingIds?.pageId === pageId ? linkingIds.ids : [];
    const pages = linking.flatMap((id) => knownPages.find((page) => page.id === id) ?? []);
    if (!online || pages.length === 0) return null;

    return (
        <nav
            aria-label="Verlinkt von"
            className="mb-4 flex flex-wrap items-center gap-1 px-[var(--page-gutter)] text-sm"
        >
            <span className="flex items-center gap-1 text-muted-foreground">
                <CornerDownRight className="size-3.5" aria-hidden="true" />
                Verlinkt von
            </span>
            {pages.map((page) => (
                <button
                    key={page.id}
                    type="button"
                    onClick={() => onOpen(page.id)}
                    className="rounded px-1.5 py-0.5 hover:bg-accent pointer-coarse:py-1.5"
                >
                    {page.icon ? `${page.icon} ` : ""}
                    {displayTitle(page)}
                </button>
            ))}
        </nav>
    );
}
