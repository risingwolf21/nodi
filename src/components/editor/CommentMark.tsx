import { useSyncExternalStore } from "react";
import { commentMarks, showThread } from "@/features/comments/comment-marks";

/**
 * Text with a comment (package 31b). Highlighted while its thread is open;
 * resolved or unknown threads (deleted, public view) leave plain text.
 */
export function CommentMark({
    threadId,
    contentRef,
}: {
    threadId: string;
    contentRef: (el: HTMLElement | null) => void;
}) {
    const state = useSyncExternalStore(commentMarks.subscribe, () => commentMarks.state(threadId));
    if (state !== "open") return <span ref={contentRef} />;
    return (
        <span
            ref={contentRef}
            className="nodi-comment-mark"
            data-thread-id={threadId}
            title="Kommentar anzeigen"
            onClick={() => showThread(threadId)}
        />
    );
}
