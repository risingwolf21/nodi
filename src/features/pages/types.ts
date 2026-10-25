/** "workspace": every member reads and edits; "private": only the owner (plus shares). */
export type PageSection = "workspace" | "private";

/** A database's subpages are its entries (package 14). Fixed at creation. */
export type PageKind = "page" | "database";

export type Page = {
    id: string;
    title: string;
    parent_id: string | null;
    /** Only the owner may share the page. */
    owner_id: string;
    /** A subpage of a private page is private (enforced by the server). */
    visibility: PageSection;
    /** Emoji shown before the title; null for the default page icon. */
    icon: string | null;
    /** Text column spans the whole width (like Notion's "Full width"). */
    full_width: boolean;
    kind: PageKind;
    /** Manual order among siblings (database entries); null: by creation. */
    position: number | null;
    /** ISO time; empty for trees cached before package 14. */
    created_at: string;
    /** An entry that is a template of its database (package 26); missing means no. */
    is_template?: boolean;
    /** Cover above the title (package 30c): "gradient:<name>" or a `nodi-file:` image; missing or null means none. */
    cover?: string | null;
    /** In the user's favorites (package 30b); missing means no. */
    favorite?: boolean;
};

/** Page settings that can be changed after creation. */
export type PageSettings = Partial<Pick<Page, "icon" | "full_width" | "cover">>;

export type StoredPage = Page & {
    is_archived: boolean;
};

export type Workspace = {
    id: string;
    name: string;
};
