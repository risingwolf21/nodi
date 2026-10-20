// Comments on text (package 31b): the text carries a "comment" style whose
// value is the thread's id; the thread lives in page_comments. The editor
// (marks, toolbar) and the comment list (PageComments) are apart in the
// tree, so they meet here: the list says which threads are open, the editor
// asks for a new thread and for a thread to be shown.

export type ThreadState = "open" | "resolved";

type Listener = () => void;

const states = new Map<string, ThreadState>();
const listeners = new Set<Listener>();

function notify() {
    for (const listener of listeners) listener();
}

export const commentMarks = {
    subscribe(listener: Listener): () => void {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },

    /** Unknown threads (deleted, not readable, public view) show no mark. */
    state(threadId: string): ThreadState | undefined {
        return states.get(threadId);
    },

    /** The threads of the open page, as loaded by the comment list. */
    setThreads(threads: { id: string; state: ThreadState }[]) {
        states.clear();
        for (const thread of threads) states.set(thread.id, thread.state);
        notify();
    },
};

/** A thread to start on the selected text; `cancel` removes the mark again. */
export type CommentRequest = { pageId: string; threadId: string; quote: string; cancel: () => void };

const START_EVENT = "nodi:start-comment";
const SHOW_EVENT = "nodi:show-comment";

export function requestComment(request: CommentRequest) {
    window.dispatchEvent(new CustomEvent<CommentRequest>(START_EVENT, { detail: request }));
}

export function onCommentRequest(listener: (request: CommentRequest) => void): () => void {
    const handle = (event: Event) => {
        if (event instanceof CustomEvent) listener(event.detail as CommentRequest);
    };
    window.addEventListener(START_EVENT, handle);
    return () => window.removeEventListener(START_EVENT, handle);
}

export function showThread(threadId: string) {
    window.dispatchEvent(new CustomEvent<string>(SHOW_EVENT, { detail: threadId }));
}

export function onShowThread(listener: (threadId: string) => void): () => void {
    const handle = (event: Event) => {
        if (event instanceof CustomEvent && typeof event.detail === "string") listener(event.detail);
    };
    window.addEventListener(SHOW_EVENT, handle);
    return () => window.removeEventListener(SHOW_EVENT, handle);
}

/** As the server allows (migration 31b). */
export const MAX_QUOTE_LENGTH = 500;
