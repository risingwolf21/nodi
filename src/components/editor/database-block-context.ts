import { createContext } from "react";
import type { WorkspaceMember } from "@/features/pages/services/workspace-members";
import type { Page } from "@/features/pages/types";

/**
 * What a "Datenbank" block (package 19c), page links (28) and mentions (37)
 * need from the app around the editor. The public view has none: there
 * they show only their stored text.
 */
export type DatabaseBlockContextValue = {
    pageId: string;
    userId: string;
    /** The page's text can be changed: edit rights, and the page tree is not a cached copy. */
    canEditPage: boolean;
    /** The page tree is a cached copy (offline). */
    readOnly: boolean;
    /** Pages known to the app, to find a block's database and its entries. */
    pages: Page[];
    /** Databases a block can show (the workspace's). */
    databases: Page[];
    onOpenPage: (pageId: string) => void;
    /** Adds an entry to a database; undefined where that is not possible. */
    onCreateEntry?: (databaseId: string) => Promise<string>;
    onRenameEntry: (pageId: string, title: string) => Promise<void>;
    /** Who can be mentioned with "@" (package 37); also how mentions show their names. */
    people: WorkspaceMember[];
};

export const DatabaseBlockContext = createContext<DatabaseBlockContextValue | null>(null);
