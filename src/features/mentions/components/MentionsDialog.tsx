import { AtSign, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { Mention } from "../mentions";

const dateFormat = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

type MentionsDialogProps = {
    mentions: Mention[];
    error: string;
    onOpen: (mention: Mention) => void;
    onMarkAllRead: () => void;
    onClose: () => void;
};

/** Where the user was mentioned (package 37), newest first; unread ones marked. */
export function MentionsDialog({ mentions, error, onOpen, onMarkAllRead, onClose }: MentionsDialogProps) {
    const unread = mentions.filter((mention) => !mention.readAt).length;

    return (
        <Dialog labelledBy="mentions-title" onClose={onClose} className="w-[min(32rem,calc(100vw-2rem))]">
            <div className="flex items-center justify-between gap-2">
                <h2 id="mentions-title" className="text-lg font-semibold">
                    Erwähnungen
                </h2>
                {unread > 0 && (
                    <Button type="button" variant="ghost" size="sm" onClick={onMarkAllRead}>
                        Alle als gelesen markieren
                    </Button>
                )}
            </div>

            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
            {!error && mentions.length === 0 && (
                <p className="text-sm text-muted-foreground">Noch hat dich niemand erwähnt.</p>
            )}

            <ul className="max-h-[60vh] space-y-1 overflow-y-auto">
                {mentions.map((mention) => (
                    <li key={mention.id}>
                        <button
                            type="button"
                            onClick={() => onOpen(mention)}
                            className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
                        >
                            <span className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true">
                                {mention.pageIcon ?? <FileText className="size-4" />}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className={mention.readAt ? "block truncate" : "block truncate font-semibold"}>
                                    {mention.pageTitle || "Ohne Titel"}
                                </span>
                                <span className="block text-xs text-muted-foreground">
                                    <AtSign className="inline size-3" aria-hidden="true" />{" "}
                                    {mention.mentionedBy ?? "Jemand"} ·{" "}
                                    {dateFormat.format(new Date(mention.mentionedAt))}
                                </span>
                            </span>
                            {!mention.readAt && (
                                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" aria-label="Ungelesen" />
                            )}
                        </button>
                    </li>
                ))}
            </ul>

            <div className="flex justify-end">
                <Button type="button" variant="outline" onClick={onClose}>
                    Schließen
                </Button>
            </div>
        </Dialog>
    );
}
