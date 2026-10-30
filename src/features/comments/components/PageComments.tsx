import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Check, RotateCcw } from "lucide-react";
import { commentMarks, onCommentRequest, onShowThread, type CommentRequest } from "../comment-marks";
import { groupThreads, MAX_COMMENT_LENGTH, type CommentThread, type PageComment } from "../comment-threads";
import { pageComments } from "../services/page-comments";
import { useActivityReload } from "@/features/realtime/useActivityReload";

const dateFormat = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

const linkButton =
    "rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground pointer-coarse:py-1.5";

/** Runs a change and reloads the comments; false if it failed (the message is shown). */
type RunChange = (change: () => Promise<void>) => Promise<boolean>;

type PageCommentsProps = {
    pageId: string;
    userId: string | undefined;
    /** Comments are loaded and written online only. */
    online: boolean;
    /** Whoever may edit the page comments, replies and resolves (package 31a). */
    canComment: boolean;
    /** A new comment is being written; started by "Kommentar hinzufügen" above the title (package 45a). */
    writing: boolean;
    onWritingChange: (writing: boolean) => void;
};

/** Comments of a page, like Notion's discussion under the title (package 31a). */
export function PageComments({ pageId, userId, online, canComment, writing, onWritingChange }: PageCommentsProps) {
    const [loaded, setLoaded] = useState<{ pageId: string; comments: PageComment[] } | null>(null);
    const [reloads, setReloads] = useState(0);
    const [error, setError] = useState("");
    const [showResolved, setShowResolved] = useState(false);
    // A thread on selected text, waiting for its first comment (package 31b).
    const [pending, setPending] = useState<CommentRequest | null>(null);
    const pendingRef = useRef<CommentRequest | null>(null);
    const [shownThreadId, setShownThreadId] = useState<string | null>(null);
    // Comments written elsewhere (package 36); drafts here stay.
    const liveReloads = useActivityReload((activity) => activity.change === "comments" && activity.pageId === pageId);

    useEffect(() => {
        if (!online) return;
        let current = true;
        pageComments
            .list(pageId)
            .then((comments) => {
                if (current) setLoaded({ pageId, comments });
            })
            .catch((err: unknown) => {
                if (current) {
                    setError(err instanceof Error ? err.message : "Die Kommentare konnten nicht geladen werden.");
                }
            });
        return () => {
            current = false;
        };
    }, [pageId, online, reloads, liveReloads]);

    // The marks in the text show the threads of this page only.
    const threads = useMemo(() => (loaded?.pageId === pageId ? groupThreads(loaded.comments) : []), [loaded, pageId]);
    useEffect(() => {
        commentMarks.setThreads(
            threads.map(({ root }) => ({ id: root.id, state: root.resolvedAt ? "resolved" : "open" })),
        );
    }, [threads]);
    useEffect(() => () => commentMarks.setThreads([]), []);

    useEffect(
        () =>
            onCommentRequest((request) => {
                if (request.pageId !== pageId) return;
                // Only one at a time: an unsent one loses its mark.
                pendingRef.current?.cancel();
                pendingRef.current = request;
                setPending(request);
            }),
        [pageId],
    );

    useEffect(
        () =>
            onShowThread((threadId) => {
                setShownThreadId(threadId);
                document.getElementById(`comment-thread-${threadId}`)?.scrollIntoView({ block: "center" });
            }),
        [],
    );

    // The server sets times, authors and who resolved: load again after each change.
    const run: RunChange = useCallback(async (change) => {
        setError("");
        try {
            await change();
            setReloads((count) => count + 1);
            return true;
        } catch (err) {
            setError(err instanceof Error ? err.message : "Das hat nicht geklappt.");
            return false;
        }
    }, []);

    if (!online) return null;
    const open = threads.filter((thread) => thread.root.resolvedAt === null);
    const resolved = threads.filter((thread) => thread.root.resolvedAt !== null);
    if (threads.length === 0 && !(canComment && writing) && !pending && !error) return null;

    const renderThread = (thread: CommentThread) => (
        <Thread
            key={thread.root.id}
            pageId={pageId}
            thread={thread}
            userId={userId}
            canComment={canComment}
            shown={thread.root.id === shownThreadId}
            run={run}
        />
    );

    return (
        <section aria-label="Kommentare" className="mb-4 px-[var(--page-gutter)]">
            {error && (
                <p className="mb-2 text-sm text-destructive" role="alert">
                    {error}
                </p>
            )}
            {pending && (
                <div className="mb-3 rounded-lg border border-brand/40 p-3">
                    <Quote text={pending.quote} />
                    <CommentForm
                        label="Kommentar zum Text"
                        submitLabel="Kommentieren"
                        onCancel={() => {
                            pending.cancel();
                            pendingRef.current = null;
                            setPending(null);
                        }}
                        onSubmit={async (body) => {
                            const done = await run(() =>
                                pageComments.add(pageId, body, null, { id: pending.threadId, quote: pending.quote }),
                            );
                            if (done) {
                                pendingRef.current = null;
                                setPending(null);
                            }
                            return done;
                        }}
                    />
                </div>
            )}
            {open.length > 0 && <div className="space-y-3">{open.map(renderThread)}</div>}
            {resolved.length > 0 && (
                <div className="mt-2">
                    <button
                        type="button"
                        aria-expanded={showResolved}
                        onClick={() => setShowResolved((value) => !value)}
                        className={linkButton}
                    >
                        {showResolved ? "Erledigte Kommentare ausblenden" : `Erledigte Kommentare (${resolved.length})`}
                    </button>
                    {showResolved && <div className="mt-2 space-y-3 opacity-80">{resolved.map(renderThread)}</div>}
                </div>
            )}
            {canComment && writing && (
                <CommentForm
                    label="Kommentar"
                    submitLabel="Kommentieren"
                    onCancel={() => onWritingChange(false)}
                    onSubmit={async (body) => {
                        const done = await run(() => pageComments.add(pageId, body, null));
                        if (done) onWritingChange(false);
                        return done;
                    }}
                />
            )}
        </section>
    );
}

type ThreadProps = {
    pageId: string;
    thread: CommentThread;
    userId: string | undefined;
    canComment: boolean;
    /** Chosen in the text: shown with a frame. */
    shown: boolean;
    run: RunChange;
};

function Quote({ text }: { text: string }) {
    return (
        <blockquote className="mb-2 border-l-2 border-brand/60 pl-2 text-sm text-muted-foreground">{text}</blockquote>
    );
}

function Thread({ pageId, thread, userId, canComment, shown, run }: ThreadProps) {
    const [replying, setReplying] = useState(false);
    const { root } = thread;
    const isResolved = root.resolvedAt !== null;

    return (
        <article
            id={`comment-thread-${root.id}`}
            aria-label={`Kommentar von ${root.authorEmail}`}
            className={`rounded-lg border p-3 ${shown ? "ring-2 ring-brand" : ""}`}
        >
            {root.quote && <Quote text={root.quote} />}
            <Comment comment={root} own={root.authorId === userId} run={run} />
            {thread.replies.map((reply) => (
                <div key={reply.id} className="mt-3 border-l-2 pl-3">
                    <Comment comment={reply} own={reply.authorId === userId} run={run} />
                </div>
            ))}
            {canComment && !replying && (
                <div className="mt-2 flex flex-wrap gap-1">
                    {!isResolved && (
                        <button type="button" onClick={() => setReplying(true)} className={linkButton}>
                            Antworten
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => void run(() => pageComments.setResolved(root.id, !isResolved))}
                        className={`${linkButton} flex items-center gap-1`}
                    >
                        {isResolved ? (
                            <RotateCcw className="size-3" aria-hidden="true" />
                        ) : (
                            <Check className="size-3" aria-hidden="true" />
                        )}
                        {isResolved ? "Wieder öffnen" : "Erledigt"}
                    </button>
                </div>
            )}
            {replying && (
                <CommentForm
                    label="Antwort"
                    submitLabel="Antworten"
                    onCancel={() => setReplying(false)}
                    onSubmit={async (body) => {
                        const done = await run(() => pageComments.add(pageId, body, root.id));
                        if (done) setReplying(false);
                        return done;
                    }}
                />
            )}
        </article>
    );
}

function Comment({ comment, own, run }: { comment: PageComment; own: boolean; run: RunChange }) {
    const [editing, setEditing] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const isThread = comment.parentId === null;

    return (
        <div>
            <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{comment.authorEmail || "Unbekannt"}</span>
                <time dateTime={comment.createdAt}>{dateFormat.format(new Date(comment.createdAt))}</time>
                {comment.editedAt && <span>(bearbeitet)</span>}
            </p>
            {editing ? (
                <CommentForm
                    label="Kommentar bearbeiten"
                    submitLabel="Speichern"
                    initial={comment.body}
                    onCancel={() => setEditing(false)}
                    onSubmit={async (body) => {
                        const done = await run(() => pageComments.edit(comment.id, body));
                        if (done) setEditing(false);
                        return done;
                    }}
                />
            ) : (
                <p className="mt-1 text-sm whitespace-pre-wrap">{comment.body}</p>
            )}
            {own && !editing && (
                <div className="mt-1 flex flex-wrap gap-1">
                    <button type="button" onClick={() => setEditing(true)} className={linkButton}>
                        Bearbeiten
                    </button>
                    {confirmDelete ? (
                        <>
                            <button
                                type="button"
                                onClick={() => void run(() => pageComments.remove(comment.id))}
                                className={`${linkButton} text-destructive`}
                            >
                                {isThread ? "Mit allen Antworten löschen" : "Wirklich löschen"}
                            </button>
                            <button type="button" onClick={() => setConfirmDelete(false)} className={linkButton}>
                                Abbrechen
                            </button>
                        </>
                    ) : (
                        <button type="button" onClick={() => setConfirmDelete(true)} className={linkButton}>
                            Löschen
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

type CommentFormProps = {
    label: string;
    submitLabel: string;
    initial?: string;
    onCancel: () => void;
    /** Resolves to whether it was saved; the text stays otherwise. */
    onSubmit: (body: string) => Promise<boolean>;
};

function CommentForm({ label, submitLabel, initial = "", onCancel, onSubmit }: CommentFormProps) {
    const [body, setBody] = useState(initial);
    const [saving, setSaving] = useState(false);

    async function submit(event?: FormEvent) {
        event?.preventDefault();
        const text = body.trim();
        if (!text || saving) return;
        setSaving(true);
        await onSubmit(text);
        setSaving(false);
    }

    return (
        <form onSubmit={(event) => void submit(event)} className="mt-2">
            <textarea
                autoFocus
                aria-label={label}
                value={body}
                maxLength={MAX_COMMENT_LENGTH}
                rows={2}
                onChange={(event) => setBody(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void submit();
                    if (event.key === "Escape") onCancel();
                }}
                className="w-full resize-y rounded-md border bg-transparent px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
            <div className="mt-1 flex gap-2">
                <button
                    type="submit"
                    disabled={!body.trim() || saving}
                    className="rounded-md bg-primary px-2.5 py-1 text-sm text-primary-foreground disabled:opacity-50"
                >
                    {submitLabel}
                </button>
                <button type="button" onClick={onCancel} className="rounded-md px-2.5 py-1 text-sm hover:bg-accent">
                    Abbrechen
                </button>
            </div>
        </form>
    );
}
