
export type Page = {
    id: string;
    title: string;
    parent_id: string | null;
    /** Only the owner may share the page. */
    owner_id: string;
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
