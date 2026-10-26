// Mentions of people (package 37): rows of list_my_mentions, validated.

export type Mention = {
    id: string;
    pageId: string;
    workspaceId: string;
    pageTitle: string;
    pageIcon: string | null;
    /** E-mail of whoever mentioned; null if that account is gone. */
    mentionedBy: string | null;
    mentionedAt: string;
    readAt: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const optionalText = (value: unknown) => (typeof value === "string" ? value : null);

/** An invalid answer is an error, not an empty list. */
export function parseMentions(value: unknown): Mention[] {
    if (!Array.isArray(value)) throw new Error("Unerwartete Antwort beim Laden der Erwähnungen.");
    return value.map((row: unknown) => {
        if (
            !isRecord(row) ||
            typeof row.id !== "string" ||
            typeof row.page_id !== "string" ||
            typeof row.workspace_id !== "string" ||
            typeof row.mentioned_at !== "string"
        ) {
            throw new Error("Unerwartete Antwort beim Laden der Erwähnungen.");
        }
        return {
            id: row.id,
            pageId: row.page_id,
            workspaceId: row.workspace_id,
            pageTitle: typeof row.page_title === "string" ? row.page_title : "",
            pageIcon: optionalText(row.page_icon),
            mentionedBy: optionalText(row.mentioned_by_email),
            mentionedAt: row.mentioned_at,
            readAt: optionalText(row.read_at),
        };
    });
}

/** "anna" for "anna@example.org": how a mention shows a person in the text. */
export function personName(email: string): string {
    const at = email.indexOf("@");
    return at > 0 ? email.slice(0, at) : email;
}
