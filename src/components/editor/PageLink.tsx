import { useContext } from "react";
import { FileText, Table2 } from "lucide-react";
import { displayTitle } from "@/features/pages/page-display";
import { DatabaseBlockContext } from "./database-block-context";

/**
 * A link to a page in the text (package 28). The title comes from the page
 * tree, so it follows renames; `title` is the one at linking time, for the
 * public view and for pages the app does not know (deleted, not shared).
 */
export function PageLink({ pageId, title }: { pageId: string; title: string }) {
    const context = useContext(DatabaseBlockContext);
    const page = context?.pages.find((item) => item.id === pageId);
    const label = page ? displayTitle(page) : title || "Seite";
    const icon =
        page?.icon ??
        (page?.kind === "database" ? <Table2 className="inline size-3.5" /> : <FileText className="inline size-3.5" />);

    if (!context || !page) {
        return (
            <span className="text-muted-foreground" title="Diese Seite ist nicht verfügbar.">
                {label}
            </span>
        );
    }
    return (
        <button
            type="button"
            contentEditable={false}
            onClick={() => context.onOpenPage(pageId)}
            className="nodi-page-link inline-flex items-baseline gap-0.5 rounded px-0.5 align-baseline font-medium underline decoration-border underline-offset-4 hover:bg-accent"
        >
            <span className="text-muted-foreground" aria-hidden="true">
                {icon}
            </span>
            {label}
        </button>
    );
}
