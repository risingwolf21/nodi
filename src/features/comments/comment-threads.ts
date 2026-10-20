/** A comment as the app shows it (RPC list_page_comments, package 31a). */
export type PageComment = {
    id: string;
    parentId: string | null;
    authorId: string;
    authorEmail: string;
    body: string;
    /** The text a thread is about (package 31b); null for comments on the page. */
    quote: string | null;
    createdAt: string;
    editedAt: string | null;
    resolvedAt: string | null;
};

/** A thread: the first comment and its replies, oldest first. */
export type CommentThread = { root: PageComment; replies: PageComment[] };

/** Rows of `list_page_comments`; an invalid row is an error, not skipped. */
export function parseComments(rows: unknown): PageComment[] {
    if (!Array.isArray(rows)) throw new Error("Unerwartete Antwort beim Laden der Kommentare.");
    return rows.map((row: unknown): PageComment => {
        const text = (key: string): string | null => {
            if (typeof row !== "object" || row === null || !(key in row)) return null;
            const value: unknown = Reflect.get(row, key);
            return typeof value === "string" ? value : null;
        };
        const id = text("id");
        const authorId = text("author_id");
        const body = text("body");
        const createdAt = text("created_at");
        if (!id || !authorId || body === null || !createdAt) {
            throw new Error("Unerwartete Antwort beim Laden der Kommentare.");
        }
        return {
            id,
            parentId: text("parent_id"),
            authorId,
            authorEmail: text("author_email") ?? "",
            body,
            quote: text("quote"),
            createdAt,
            editedAt: text("edited_at"),
            resolvedAt: text("resolved_at"),
        };
    });
}

/** Threads in the order they were started; replies whose thread is missing are left out. */
export function groupThreads(comments: PageComment[]): CommentThread[] {
    const byCreation = [...comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const threads = new Map<string, CommentThread>();
    for (const comment of byCreation) {
        if (comment.parentId === null) threads.set(comment.id, { root: comment, replies: [] });
    }
    for (const comment of byCreation) {
        if (comment.parentId !== null) threads.get(comment.parentId)?.replies.push(comment);
    }
    return [...threads.values()];
}

export const MAX_COMMENT_LENGTH = 5000;
