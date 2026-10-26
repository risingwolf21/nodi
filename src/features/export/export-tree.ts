import type { Page } from "@/features/pages/types";

// The layout of an export is that of a Notion export (CLAUDE.md §12 P34), so
// nodi's import reads it back: every page is `Title <32 hex id>.md`, its
// subpages and files sit in the folder `Title <id>/` next to it, a database
// is `Title <id>.csv` with its entries in the folder (package 34b).

const MAX_NAME = 80;
// Characters that file systems or ZIP tools refuse, and control characters.
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\\/:*?"<>|\u0000-\u001f]/g;

/** A title as part of a file name: no separators or reserved characters, not empty. */
export function safeName(title: string): string {
    const name = title.replace(UNSAFE, "-").replace(/\s+/g, " ").trim().slice(0, MAX_NAME).trim();
    return name.replace(/^\.+/, "") || "Ohne Titel";
}

/** "Reise", id "1a2b-…" → "Reise 1a2b…": Notion's form, an id of 32 hex characters. */
export const exportBaseName = (page: Pick<Page, "id" | "title">) =>
    `${safeName(page.title)} ${page.id.replace(/-/g, "").toLowerCase()}`;

export type ExportItem = {
    page: Page;
    /** `Folder/Title <id>.md` (or `.csv` for a database). */
    path: string;
    /** Where its subpages and files go: `Folder/Title <id>`. */
    folder: string;
};

/**
 * The pages to export: the given roots with everything below them, parents
 * first, siblings by title. A database's entries are pages in its folder
 * (their values are in its CSV, package 34b); their templates are not exported.
 */
export function planExport(pages: readonly Page[], rootIds: readonly string[]): ExportItem[] {
    const childrenOf = new Map<string, Page[]>();
    for (const page of pages) {
        if (page.parent_id === null) continue;
        childrenOf.set(page.parent_id, [...(childrenOf.get(page.parent_id) ?? []), page]);
    }
    const byTitle = (a: Page, b: Page) => a.title.localeCompare(b.title, "de") || a.id.localeCompare(b.id);
    const byId = new Map(pages.map((page) => [page.id, page]));

    const items: ExportItem[] = [];
    const visit = (page: Page, folder: string, depth: number) => {
        // The tree has no cycles (move_page checks), the limit only guards against bad data.
        if (depth > 50) return;
        // Entry templates are not exported; page templates are pages like others (package 38b).
        if (page.is_template && page.parent_id !== null && byId.get(page.parent_id)?.kind === "database") return;
        const base = exportBaseName(page);
        const prefix = folder ? `${folder}/` : "";
        items.push({
            page,
            path: `${prefix}${base}.${page.kind === "database" ? "csv" : "md"}`,
            folder: `${prefix}${base}`,
        });
        for (const child of [...(childrenOf.get(page.id) ?? [])].sort(byTitle))
            visit(child, `${prefix}${base}`, depth + 1);
    };
    for (const id of rootIds) {
        const root = byId.get(id);
        if (root) visit(root, "", 0);
    }
    return items;
}

/** A link from one file of the export to another, encoded like Notion's ("Reise%201a2b….md"). */
export function relativeHref(fromFile: string, toFile: string): string {
    const from = fromFile.split("/").slice(0, -1);
    const to = toFile.split("/");
    let common = 0;
    while (common < from.length && common < to.length - 1 && from[common] === to[common]) common += 1;
    const up = from.slice(common).map(() => "..");
    // Parentheses too: an unmatched one would end a Markdown link early.
    const encode = (segment: string) => encodeURIComponent(segment).replace(/\(/g, "%28").replace(/\)/g, "%29");
    return [...up, ...to.slice(common)].map(encode).join("/");
}
