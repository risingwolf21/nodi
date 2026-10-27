import { useCallback, useEffect, useState } from "react";
import { onMentionChange } from "@/features/realtime/page-activity";
import type { Mention } from "../mentions";
import { pageMentions } from "../services/page-mentions";

type UseMentionsResult = {
    mentions: Mention[];
    unread: number;
    error: string;
    markRead: (mentionId: string) => Promise<void>;
    markAllRead: () => Promise<void>;
};

/**
 * The own mentions (package 37), from the server only: they are a notice,
 * not content, so there is no offline copy. Reloads when Realtime reports a
 * change and when back online.
 */
export function useMentions(userId: string | undefined, online: boolean): UseMentionsResult {
    const [mentions, setMentions] = useState<Mention[]>([]);
    const [error, setError] = useState("");
    const [reloads, setReloads] = useState(0);

    useEffect(() => {
        const reload = () => setReloads((count) => count + 1);
        const stop = onMentionChange(reload);
        window.addEventListener("online", reload);
        return () => {
            stop();
            window.removeEventListener("online", reload);
        };
    }, []);

    useEffect(() => {
        if (!userId || !online) return;
        let active = true;
        pageMentions
            .list()
            .then((loaded) => {
                if (!active) return;
                setMentions(loaded);
                setError("");
            })
            .catch((err: unknown) => {
                if (active)
                    setError(err instanceof Error ? err.message : "Die Erwähnungen konnten nicht geladen werden.");
            });
        return () => {
            active = false;
        };
    }, [userId, online, reloads]);

    const markRead = useCallback(async (mentionId: string) => {
        const readAt = new Date().toISOString();
        setMentions((current) =>
            current.map((mention) => (mention.id === mentionId && !mention.readAt ? { ...mention, readAt } : mention)),
        );
        await pageMentions.markRead(mentionId);
    }, []);

    const markAllRead = useCallback(async () => {
        const readAt = new Date().toISOString();
        setMentions((current) => current.map((mention) => (mention.readAt ? mention : { ...mention, readAt })));
        await pageMentions.markAllRead();
    }, []);

    return {
        mentions: userId && online ? mentions : [],
        unread: userId && online ? mentions.filter((mention) => !mention.readAt).length : 0,
        error,
        markRead,
        markAllRead,
    };
}
