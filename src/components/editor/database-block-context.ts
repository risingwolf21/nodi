import { createContext } from "react";
import type { Page } from "@/features/pages/types";

/**
 * What a "Datenbank" block needs from the app around the editor (package
 * 19c). The public view has none: there the block shows only a note.
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
};

export const DatabaseBlockContext = createContext<DatabaseBlockContextValue | null>(null);
