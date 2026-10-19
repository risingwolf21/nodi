// The structure of a Notion export ("Markdown & CSV", decision of the user,
// CLAUDE.md §12 P16): every page is `Title <32 hex id>.md`; its subpages,
// images and attachments sit in a folder of the same name next to it. A
// database is `Title <id>.csv` (and `…_all.csv` with all properties) with a
// folder of entry pages next to it.

const NOTION_ID = /\s+[0-9a-f]{32}$/i;

/** "Reise 1a2b….md" → "Reise". */
export function titleFromFileName(path: string): string {
    const name = path.split("/").pop() ?? path;
    const withoutExtension = name.replace(/\.(md|csv)$/i, "");
    return withoutExtension.replace(NOTION_ID, "").trim();
}

export function dirname(path: string): string {
    const index = path.lastIndexOf("/");
    return index === -1 ? "" : path.slice(0, index);
}

/**
 * Resolves a link of a Markdown file to a path in the export. Null for links
 * to the web or other places outside the export.
 */
export function resolveExportPath(fromFile: string, href: string): string | null {
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("/") || href.startsWith("#")) return null;
    let decoded: string;
    try {
        decoded = decodeURIComponent(href.split(/[?#]/)[0]);
    } catch {
        return null;
    }
    const segments = dirname(fromFile).split("/").filter(Boolean);
    for (const segment of decoded.split("/")) {
        if (segment === "" || segment === ".") continue;
        if (segment === "..") {
            if (segments.length === 0) return null;
            segments.pop();
        } else {
            segments.push(segment);
        }
    }
    return segments.join("/") || null;
}

/** The title from a leading `# Heading`, and the text without it. */
export function splitTitle(markdown: string): { title: string | null; body: string } {
    const match = /^\s*#[ \t]+(.+?)[ \t]*(?:\r?\n|$)/.exec(markdown);
    if (!match) return { title: null, body: markdown };
    return { title: match[1].trim(), body: markdown.slice(match[0].length) };
}

export type PlannedPage = {
    kind: "page";
    /** Path of the Markdown file in the export. */
    path: string;
    title: string;
    parentPath: string | null;
};

export type PlannedDatabase = {
    kind: "database";
    /** `Title <id>.csv`; links in pages point here. */
    path: string;
    /** The CSV to read: `…_all.csv` (all properties) if the export has it. */
    dataPath: string;
    title: string;
    parentPath: string | null;
    /** Markdown files of the entries (their text); their subpages are not imported. */
    entryPaths: string[];
};

export type ImportPlan = {
    /** Parents come before their subpages, siblings in Notion's order. */
    items: (PlannedPage | PlannedDatabase)[];
    /** Pages and databases inside database entries; entries have no subpages in Nodi. */
    skippedInEntries: number;
};

const MARKDOWN_LINK = /\]\(([^)\s]+)\)/g;

/** Plans which pages and databases to create, from the Markdown files of an export. */
export function planNotionImport(files: ReadonlyMap<string, string>, allPaths: Iterable<string>): ImportPlan {
    const paths = new Set(allPaths);
    // `X.csv` and `X_all.csv` are one database, known as `X.csv`.
    const csvPaths = [...paths].filter((path) => path.toLowerCase().endsWith(".csv"));
    const databasePaths = [...new Set(csvPaths.map((path) => path.replace(/_all(\.csv)$/i, "$1")))];
    const folderOf = (csvPath: string) => csvPath.slice(0, -".csv".length);

    const insideDatabase = (path: string) =>
        databasePaths.some((database) => path.startsWith(`${folderOf(database)}/`));
    const markdownPaths = [...files.keys()].filter((path) => !insideDatabase(path));
    const topDatabases = databasePaths.filter((path) => !insideDatabase(path));

    // A page's subpages live in the folder named like the page.
    const parentOf = (path: string): string | null => {
        let folder = dirname(path);
        while (folder) {
            if (files.has(`${folder}.md`)) return `${folder}.md`;
            folder = dirname(folder);
        }
        return null;
    };

    const title = (path: string) => {
        const heading = splitTitle(files.get(path) ?? "").title;
        return heading || titleFromFileName(path) || "Ohne Titel";
    };

    // Notion lists subpages as links in the parent's text, in its order.
    const linkOrder = (parentPath: string): Map<string, number> => {
        const order = new Map<string, number>();
        for (const match of (files.get(parentPath) ?? "").matchAll(MARKDOWN_LINK)) {
            const target = resolveExportPath(parentPath, match[1]);
            if (target && !order.has(target)) order.set(target, order.size);
        }
        return order;
    };

    const databaseTitle = (path: string) => titleFromFileName(path) || "Ohne Titel";
    const isDatabase = (path: string) => path.toLowerCase().endsWith(".csv");
    const itemTitle = (path: string) => (isDatabase(path) ? databaseTitle(path) : title(path));

    const childrenOf = new Map<string | null, string[]>();
    for (const path of [...markdownPaths, ...topDatabases]) {
        const parent = parentOf(path);
        childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), path]);
    }

    const database = (path: string, parentPath: string | null): PlannedDatabase => {
        const allPath = path.replace(/\.csv$/i, "_all.csv");
        const folder = `${folderOf(path)}/`;
        return {
            kind: "database",
            path,
            dataPath: paths.has(allPath) ? allPath : path,
            title: databaseTitle(path),
            parentPath,
            entryPaths: [...files.keys()].filter(
                (file) => file.startsWith(folder) && !file.slice(folder.length).includes("/"),
            ),
        };
    };

    const items: (PlannedPage | PlannedDatabase)[] = [];
    const visit = (parentPath: string | null) => {
        const order = parentPath ? linkOrder(parentPath) : new Map<string, number>();
        const children = [...(childrenOf.get(parentPath) ?? [])].sort((a, b) => {
            const byLink = (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity);
            return byLink !== 0 && !Number.isNaN(byLink) ? byLink : itemTitle(a).localeCompare(itemTitle(b), "de");
        });
        for (const path of children) {
            if (isDatabase(path)) {
                items.push(database(path, parentPath));
            } else {
                items.push({ kind: "page", path, title: title(path), parentPath });
                visit(path);
            }
        }
    };
    visit(null);

    const entryPaths = new Set(items.flatMap((item) => (item.kind === "database" ? item.entryPaths : [])));
    const skippedInEntries =
        [...files.keys()].filter((path) => insideDatabase(path) && !entryPaths.has(path)).length +
        databasePaths.filter(insideDatabase).length;
    return { items, skippedInEntries };
}
