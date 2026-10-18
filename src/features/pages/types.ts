
/** "workspace": every member reads and edits; "private": only the owner (plus shares). */
export type PageSection = "workspace" | "private";

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
};

/** Page settings that can be changed after creation. */
export type PageSettings = Partial<Pick<Page, "icon" | "full_width">>;

export type StoredPage = Page & {
    is_archived: boolean;
};

export type Workspace = {
    id: string;
    name: string;
};
