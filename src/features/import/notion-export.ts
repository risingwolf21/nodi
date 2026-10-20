// The structure of a Notion export ("Markdown & CSV", decision of the user,
// CLAUDE.md §12 P16): every page is `Title <32 hex id>.md`; its subpages,
// images and attachments sit in a folder next to it. A database is
// `Title <id>.csv` and/or `…_all.csv` (all properties) with a folder of
// entry pages next to it. Older exports name these folders like the file
// (`Title <id>/`), newer ones without the id (`Title/`, package 21).

const NOTION_ID = /\s+[0-9a-f]{32}$/i;

/** "Reise 1a2b….md" → "Reise". */
export function titleFromFileName(path: string): string {
    const name = path.split("/").pop() ?? path;
    const withoutExtension = name.replace(/(?:_all)?\.(md|csv)$/i, "");
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
    /**
     * Copies of a database for a view embedded in a page (`Untitled 8fe7-1f36_all.csv`
     * next to the export's top): copy path → path of the database.
     */
    databaseCopies: Map<string, string>;
};

const MARKDOWN_LINK = /\]\(([^)\s]+)\)/g;
const ID_IN_NAME = /\s([0-9a-f]{32})(?:_all)?\.(?:md|csv)$/i;
// A view's copy names its database by the first and last four characters of its id.
const DATABASE_COPY = /\s([0-9a-f]{4})-([0-9a-f]{4})(?:_all)?\.csv$/i;

/** "Ordner/Aufgaben 1a2b….md" → "1a2b…". */
const notionId = (path: string): string | null => ID_IN_NAME.exec(path)?.[1].toLowerCase() ?? null;

/** "Ordner/Aufgaben 1a2b…_all.csv" → "Ordner/Aufgaben 1a2b…": the file without extension. */
const withoutExtension = (path: string) => path.replace(/(?:_all)?\.(?:md|csv)$/i, "");

/** "Ordner/Aufgaben 1a2b…_all.csv" → "Ordner/Aufgaben": the folder name of newer exports. */
const withoutId = (path: string) => withoutExtension(path).replace(NOTION_ID, "");

/** Plans which pages and databases to create, from the Markdown files of an export. */
export function planNotionImport(files: ReadonlyMap<string, string>, allPaths: Iterable<string>): ImportPlan {
    const paths = new Set(allPaths);
    const csvPaths = [...paths].filter((path) => path.toLowerCase().endsWith(".csv"));
    // A copy has no full id ("Saison 2024-2025 <id>.csv" is a database).
    const isCopy = (path: string) => !ID_IN_NAME.test(path) && DATABASE_COPY.test(path);
    const copyPaths = csvPaths.filter(isCopy);
    // `X.csv` and `X_all.csv` are one database, known as `X.csv`.
    const canonical = (csvPath: string) => csvPath.replace(/_all(\.csv)$/i, "$1");
    const databasePaths = [...new Set(csvPaths.filter((path) => !isCopy(path)).map(canonical))];
    // Both folder names, older (`X <id>/`) and newer (`X/`).
    const foldersOf = (path: string) => [`${withoutExtension(path)}/`, `${withoutId(path)}/`];
    const databaseFolders = databasePaths.flatMap(foldersOf);
    const insideDatabase = (path: string) => databaseFolders.some((folder) => path.startsWith(folder));

    // A full-page database has a page of the same id next to it: it is the database itself.
    const databaseById = new Map(databasePaths.flatMap((path) => (notionId(path) ? [[notionId(path), path]] : [])));
    const isDatabasePage = (path: string) => {
        const database = databaseById.get(notionId(path) ?? "");
        return database !== undefined && dirname(database) === dirname(path);
    };

    const markdownPaths = [...files.keys()].filter((path) => !insideDatabase(path) && !isDatabasePage(path));
    const topDatabases = databasePaths.filter((path) => !insideDatabase(path));

    // A folder belongs to the page named like it, with or without the id.
    const pagesByFolder = new Map<string, string[]>();
    for (const path of markdownPaths) {
        for (const folder of new Set(foldersOf(path))) {
            pagesByFolder.set(folder, [...(pagesByFolder.get(folder) ?? []), path]);
        }
    }
    const linksTo = (from: string, target: string) =>
        [...(files.get(from) ?? "").matchAll(MARKDOWN_LINK)].some((match) => {
            const linked = resolveExportPath(from, match[1]);
            return linked !== null && (linked === target || target.startsWith(`${withoutId(linked)}/`));
        });
    const parentOf = (path: string): string | null => {
        let folder = dirname(path);
        while (folder) {
            const owners = pagesByFolder.get(`${folder}/`) ?? [];
            // Siblings with the same title share a folder in newer exports: the one linking the page wins.
            if (owners.length > 0) return owners.find((owner) => linksTo(owner, path)) ?? owners[0];
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
            const linked = resolveExportPath(parentPath, match[1]);
            // A database is linked by its CSV or its page; it is known by `X.csv`.
            const target = linked && (databaseById.get(notionId(linked) ?? "") ?? linked);
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
        const folders = foldersOf(path);
        return {
            kind: "database",
            path,
            dataPath: paths.has(allPath) ? allPath : path,
            title: databaseTitle(path),
            parentPath,
            entryPaths: [...files.keys()].filter((file) =>
                folders.some((folder) => file.startsWith(folder) && !file.slice(folder.length).includes("/")),
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

    const databaseCopies = new Map<string, string>();
    for (const copy of copyPaths) {
        const [, first, last] = DATABASE_COPY.exec(copy) ?? [];
        const matches = databasePaths.filter((path) => {
            const id = notionId(path) ?? "";
            return id.startsWith(first.toLowerCase()) && id.endsWith(last.toLowerCase());
        });
        if (matches.length === 1) databaseCopies.set(copy, matches[0]);
    }

    return { items, skippedInEntries, databaseCopies };
}

/** A sorting of a view embedded in a page, by property name ("Status: ascending"). */
export type NotionSort = { name: string; direction: "asc" | "desc" };

// A link to a database's CSV at the end of a line (a view in the page).
const VIEW_LINK = /\]\(([^)\s]+\.csv)\)\s*$/i;
const VIEW_SETTINGS = /^(filters|sort):$/;
const SORT_LINE = /^(.+?):\s*(ascending|descending)$/;
/** Appended to a link with settings; `resolveExportPath` ignores it. */
const VIEW_MARKER = /#nodi-view-(\d+)$/;

/**
 * Newer exports write a view's settings below its link: `filters:` (not
 * readable) and `sort:` with lines like "Status: ascending", up to the next
 * blank line or HTML tag (`</aside>`). They are removed from the text; the
 * link gets a marker (`#nodi-view-<n>`) for its sorting, see `viewSortOf`.
 */
export function takeViewSettings(markdown: string): { markdown: string; sorts: NotionSort[][] } {
    const lines = markdown.split("\n");
    const result: string[] = [];
    const sorts: NotionSort[][] = [];
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        const link = VIEW_LINK.exec(line);
        let next = index + 1;
        while (next < lines.length && !lines[next].trim()) next++;
        if (!link || /^[a-z][a-z0-9+.-]*:/i.test(link[1]) || !VIEW_SETTINGS.test(lines[next]?.trim() ?? "")) {
            result.push(line);
            continue;
        }
        const sort: NotionSort[] = [];
        let inSort = false;
        let end = next;
        for (; end < lines.length && lines[end].trim() && !lines[end].trimStart().startsWith("<"); end++) {
            const text = lines[end].trim();
            if (VIEW_SETTINGS.test(text)) inSort = text === "sort:";
            const rule = inSort ? SORT_LINE.exec(text) : null;
            if (rule) sort.push({ name: rule[1].trim(), direction: rule[2] === "ascending" ? "asc" : "desc" });
        }
        result.push(
            `${line.slice(0, link.index)}](${link[1]}#nodi-view-${sorts.length})`,
            ...lines.slice(index + 1, next),
        );
        sorts.push(sort);
        index = end - 1;
    }
    return { markdown: result.join("\n"), sorts };
}

/** The sorting given with a link by `takeViewSettings`, if any. */
export function viewSortOf(href: string, sorts: NotionSort[][]): NotionSort[] {
    const marker = VIEW_MARKER.exec(href);
    return marker ? (sorts[Number(marker[1])] ?? []) : [];
}
