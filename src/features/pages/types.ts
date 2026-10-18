
export type Page = {
    id: string;
    title: string;
    parent_id: string | null;
};

export type StoredPage = Page & {
    is_archived: boolean;
};

export type Workspace = {
    id: string;
    name: string;
};
