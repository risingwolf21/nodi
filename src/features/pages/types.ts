
export type Page = {
    id: string;
    title: string;
    parent_id: string | null;
    /** Emoji shown before the title; null for the default page icon. */
    icon: string | null;
};

export type StoredPage = Page & {
    is_archived: boolean;
};

export type Workspace = {
    id: string;
    name: string;
};
