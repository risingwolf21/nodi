import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu, isTouchDevice } from "@blocknote/core";
import {
    FormattingToolbar,
    FormattingToolbarController,
    getFormattingToolbarItems,
    getDefaultReactSlashMenuItems,
    MobileFormattingToolbarController,
    SuggestionMenuController,
    useCreateBlockNote,
    useEditorChange,
    useEditorState,
    useVirtualKeyboard,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { de } from "@blocknote/core/locales";
import { FileText, MessageSquareText, Table2 } from "lucide-react";
import "@blocknote/mantine/style.css";

import { useAuth } from "@/lib/use-auth";
import { RemoteRequestError } from "@/lib/request-errors";
import { EditorFrame } from "@/components/editor/EditorFrame";
import { editorTheme } from "@/components/editor/editor-theme";
import { DatabaseBlockContext, type DatabaseBlockContextValue } from "@/components/editor/database-block-context";
import { editorSchema } from "@/components/editor/editor-schema";
import { CommentButton } from "@/components/editor/CommentButton";
import { displayTitle } from "@/features/pages/page-display";
import { syncEngineFor } from "@/features/editor/services/account-sync";
import { documentChangesFor } from "@/features/editor/services/document-changes";
import { localDocumentStoreFor, type LocalDocumentStore } from "@/features/editor/services/local-document-store";
import {
    loadInitialDocument,
    PageDocumentSession,
    type InitialDocument,
    type SessionStatus,
} from "@/features/editor/services/page-document-session";
import { remoteDocumentRepository } from "@/features/editor/services/remote-document-repository";
import type { DocumentContent } from "@/features/editor/types";
import { fileCacheFor } from "@/features/files/services/file-cache";
import { createFileUrlResolver } from "@/features/files/services/file-url-resolver";
import { signedFileUrl, uploadPageFile } from "@/features/files/services/page-files";

type FrameProps = {
    topBarStart: ReactNode;
    topBarEnd?: ReactNode;
    fullWidth: boolean;
    /** Title and icon above the content; editable only with edit rights. */
    renderHeader: (canEdit: boolean) => ReactNode;
    /** What "Datenbank" blocks need from the app (package 19c). */
    databaseBlocks: DatabaseBlockApp;
};

/** The part of a database block's context that does not come from the editor. */
export type DatabaseBlockApp = Omit<DatabaseBlockContextValue, "pageId" | "userId" | "canEditPage">;

type BlockEditorProps = FrameProps & {
    pageId: string;
};

type LoadResult = { pageId: string; initial: InitialDocument } | { pageId: string; error: string };

// Long enough to read, short enough not to get in the way (Option A).
const SUPERSEDED_NOTICE_MS = 8000;
// The "@" menu shows this many pages; typing narrows them down.
const PAGE_LINK_CHOICES = 12;

const SUPERSEDED_NOTICE = "Diese Seite wurde auf einem anderen Gerät geändert. Die neuere Version wurde geladen.";

// BlockNote shows only this text when an upload fails, so it names the limits.
const dictionary = {
    ...de,
    file_panel: {
        ...de.file_panel,
        upload: {
            ...de.file_panel.upload,
            upload_error: "Hochladen fehlgeschlagen. Dateien brauchen Internet und höchstens 10 MB.",
        },
    },
};

function statusText(status: SessionStatus): string {
    switch (status.kind) {
        case "synced":
            return "Gespeichert";
        case "pending":
            return "Änderungen ausstehend";
        case "saving":
            return "Speichert …";
        case "unsynced":
            if (status.reason === "offline") return "Offline – lokal gespeichert";
            if (status.reason === "auth") return "Lokal gespeichert – bitte neu anmelden";
            return "Lokal gespeichert – Server nicht erreichbar";
        case "offline":
            return "Offline";
        case "error":
            return "Speichern fehlgeschlagen";
        case "loadFailed":
            return "Aktualisieren fehlgeschlagen";
    }
}

/**
 * On phones BlockNote pins its toolbar above the keyboard as long as the
 * editor has focus. Here it appears only while text is selected (decision
 * of the user, package 20), so typing keeps the room; formatting otherwise
 * goes through "/" and Markdown shortcuts.
 */
/** BlockNote's buttons and "Kommentieren" (package 31b). */
function toolbarWithComments(pageId: string) {
    return function ToolbarWithComments() {
        return (
            <FormattingToolbar>
                {getFormattingToolbarItems()}
                <CommentButton key="comment" pageId={pageId} />
            </FormattingToolbar>
        );
    };
}

function SelectionFormattingToolbar({ toolbar }: { toolbar: () => ReactNode }) {
    // Keeps BlockNote's keyboard detection running from the start: it has to
    // see the full height before the keyboard opens.
    useVirtualKeyboard();
    const textSelected = useEditorState({
        on: "selection",
        selector: ({ editor }) => {
            const selection = editor.prosemirrorState.selection;
            return !selection.empty && selection.$from.parent.isTextblock;
        },
    });
    return textSelected ? <MobileFormattingToolbarController formattingToolbar={toolbar} /> : null;
}

function loadErrorMessage(error: unknown): string {
    if (error instanceof RemoteRequestError && error.reason === "offline") {
        return "Diese Seite ist offline noch nicht verfügbar. Öffne sie einmal mit Internetverbindung, dann ist sie auch offline lesbar.";
    }
    return `Das Dokument konnte nicht geladen werden: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`;
}

// BlockNote needs at least one block; an empty document is one paragraph.
function toEditorBlocks(content: DocumentContent): DocumentContent {
    return content.length > 0 ? content : [{ type: "paragraph" }];
}

function EditorContent({
    userId,
    pageId,
    initial,
    store,
    topBarStart,
    topBarEnd,
    fullWidth,
    renderHeader,
    databaseBlocks,
}: FrameProps & {
    userId: string;
    pageId: string;
    initial: InitialDocument;
    store: LocalDocumentStore;
}) {
    const [status, setStatus] = useState<SessionStatus>(
        initial.document.synced ? { kind: "synced" } : { kind: "saving" },
    );
    const [canEdit, setCanEdit] = useState(initial.document.canEdit);
    const [showSupersededNotice, setShowSupersededNotice] = useState(false);

    const session = useRef<PageDocumentSession | null>(null);
    // Content set by sync is not a user edit and must not be saved again.
    const applyingRemoteContent = useRef(false);

    const editor = useCreateBlockNote({
        schema: editorSchema,
        dictionary,
        initialContent: initial.document.content.length > 0 ? initial.document.content : undefined,
        uploadFile: (file) => uploadPageFile(pageId, file),
        // Images seen once stay readable offline (CLAUDE.md §12 P15).
        resolveFileUrl: createFileUrlResolver({ signedUrl: signedFileUrl, cache: fileCacheFor(userId) }),
    });

    useEffect(() => {
        // Pending writes finish after unmount, but must not touch this UI.
        let disposed = false;

        const current = new PageDocumentSession({
            pageId,
            store,
            remote: remoteDocumentRepository,
            changes: documentChangesFor(userId),
            sync: syncEngineFor(userId),
            onStatus: (next) => {
                if (!disposed) setStatus(next);
            },
            onPermission: (next) => {
                if (!disposed) setCanEdit(next);
            },
            onRemoteContent: (content, supersededLocalEdit) => {
                if (disposed) return;
                applyingRemoteContent.current = true;
                try {
                    editor.replaceBlocks(editor.document, toEditorBlocks(content));
                } finally {
                    applyingRemoteContent.current = false;
                }
                if (supersededLocalEdit) setShowSupersededNotice(true);
            },
        });
        session.current = current;
        void current.start(initial.document, {
            freshFromServer: initial.freshFromServer,
        });

        // Unmount alone is not reliable when the app is closed (CLAUDE.md §4).
        const flushWhenHidden = () => {
            if (document.visibilityState === "hidden") void current.flush();
        };
        const flush = () => void current.flush();
        // A hint only; the request itself shows whether the server answers.
        // Unsynced edits are resent by the sync engine.
        const refreshWhenOnline = () => void current.refresh();

        document.addEventListener("visibilitychange", flushWhenHidden);
        window.addEventListener("pagehide", flush);
        window.addEventListener("online", refreshWhenOnline);

        return () => {
            document.removeEventListener("visibilitychange", flushWhenHidden);
            window.removeEventListener("pagehide", flush);
            window.removeEventListener("online", refreshWhenOnline);
            disposed = true;
            session.current = null;
            void current.dispose();
        };
    }, [editor, initial, pageId, store, userId]);

    useEffect(() => {
        if (!showSupersededNotice) return;

        const timer = setTimeout(() => setShowSupersededNotice(false), SUPERSEDED_NOTICE_MS);
        return () => clearTimeout(timer);
    }, [showSupersededNotice]);

    useEditorChange(() => {
        if (applyingRemoteContent.current) return;
        session.current?.recordEdit(editor.document);
    }, editor);

    // Pages to link: known pages (not templates), title matches first, a few at a time.
    // A stable component: a new one on each render would remount the toolbar.
    const commentToolbar = useMemo(() => toolbarWithComments(pageId), [pageId]);

    const pageLinkItems = (query: string) => {
        const needle = query.trim().toLocaleLowerCase("de");
        return databaseBlocks.pages
            .filter((page) => !page.is_template && page.id !== pageId)
            .filter((page) => displayTitle(page).toLocaleLowerCase("de").includes(needle))
            .slice(0, PAGE_LINK_CHOICES)
            .map((page) => ({
                title: displayTitle(page),
                group: "Seite verlinken",
                icon: page.icon ? (
                    <span>{page.icon}</span>
                ) : page.kind === "database" ? (
                    <Table2 size={18} />
                ) : (
                    <FileText size={18} />
                ),
                onItemClick: () => {
                    editor.insertInlineContent([
                        { type: "pageLink", props: { pageId: page.id, title: displayTitle(page) } },
                        " ",
                    ]);
                },
            }));
    };

    const databaseBlockContext: DatabaseBlockContextValue = {
        ...databaseBlocks,
        pageId,
        userId,
        canEditPage: canEdit !== false && !databaseBlocks.readOnly,
    };

    const canRetry = status.kind === "error" || status.kind === "loadFailed" || status.kind === "unsynced";
    const isFailure = status.kind === "error" || status.kind === "loadFailed";

    return (
        <EditorFrame
            topBarStart={topBarStart}
            topBarEnd={topBarEnd}
            fullWidth={fullWidth}
            status={
                <span className="flex items-center gap-3">
                    {canEdit === false && <span>Nur Lesezugriff</span>}
                    <span role="status" aria-live="polite">
                        {statusText(status)}
                    </span>
                </span>
            }
            notices={
                <>
                    {showSupersededNotice && (
                        <p className="px-4 pb-2 text-sm text-muted-foreground" role="status">
                            {SUPERSEDED_NOTICE}
                        </p>
                    )}

                    {canRetry && (
                        <div className="flex items-center justify-between gap-4 px-4 pb-2">
                            <p
                                className={isFailure ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
                                role={isFailure ? "alert" : undefined}
                            >
                                {status.kind === "error"
                                    ? `Speichern fehlgeschlagen: ${status.message}. Die Änderung bleibt auf diesem Gerät gespeichert.`
                                    : status.kind === "loadFailed"
                                      ? `Die neueste Version konnte nicht geladen werden: ${status.message}.`
                                      : "Die Änderungen sind auf diesem Gerät gespeichert und werden übertragen, sobald der Server erreichbar ist."}
                            </p>

                            <button
                                type="button"
                                className="shrink-0 text-sm underline"
                                onClick={() => {
                                    void session.current?.retry();
                                }}
                            >
                                Erneut versuchen
                            </button>
                        </div>
                    )}
                </>
            }
        >
            {renderHeader(canEdit !== false)}
            <DatabaseBlockContext value={databaseBlockContext}>
                <BlockNoteView
                    editor={editor}
                    theme={{ light: editorTheme, dark: editorTheme }}
                    editable={canEdit !== false}
                    slashMenu={false}
                    formattingToolbar={false}
                >
                    {/* Elsewhere the toolbar floats at the selection, as before. */}
                    {isTouchDevice() ? (
                        <SelectionFormattingToolbar toolbar={commentToolbar} />
                    ) : (
                        <FormattingToolbarController formattingToolbar={commentToolbar} />
                    )}
                    <SuggestionMenuController
                        triggerCharacter="/"
                        getItems={(query) =>
                            Promise.resolve(
                                filterSuggestionItems(
                                    [
                                        ...getDefaultReactSlashMenuItems(editor),
                                        {
                                            title: "Callout",
                                            subtext: "Hervorgehobener Text mit Emoji",
                                            aliases: ["callout", "hinweis", "info", "box", "aside"],
                                            group: "Einfache Blöcke",
                                            icon: <MessageSquareText size={18} />,
                                            onItemClick: () => {
                                                insertOrUpdateBlockForSlashMenu(editor, { type: "callout" });
                                            },
                                        },
                                        {
                                            title: "Datenbank",
                                            subtext: "Ansicht einer bestehenden Datenbank",
                                            aliases: ["datenbank", "database", "tabelle", "ansicht", "view"],
                                            group: "Datenbanken",
                                            icon: <Table2 size={18} />,
                                            onItemClick: () => {
                                                insertOrUpdateBlockForSlashMenu(editor, { type: "database" });
                                            },
                                        },
                                    ],
                                    query,
                                ),
                            )
                        }
                    />
                    {/* "@" links a page (package 28). */}
                    <SuggestionMenuController
                        triggerCharacter="@"
                        getItems={(query) => Promise.resolve(pageLinkItems(query))}
                    />
                </BlockNoteView>
            </DatabaseBlockContext>
        </EditorFrame>
    );
}

export default function BlockEditor({ pageId, ...frame }: BlockEditorProps) {
    const { user } = useAuth();
    const store = user ? localDocumentStoreFor(user.id) : null;

    const [loadResult, setLoadResult] = useState<LoadResult | null>(null);

    useEffect(() => {
        if (!store) return;
        let active = true;

        loadInitialDocument(pageId, store, remoteDocumentRepository).then(
            (initial) => {
                if (active) setLoadResult({ pageId, initial });
            },
            (error: unknown) => {
                console.error("Dokument konnte nicht geladen werden:", error);
                if (active) {
                    setLoadResult({ pageId, error: loadErrorMessage(error) });
                }
            },
        );

        return () => {
            active = false;
        };
    }, [pageId, store]);

    // The result of the previous page is ignored while the next one loads,
    // so the effect needs no synchronous reset.
    if (!user || !store || !loadResult || loadResult.pageId !== pageId) {
        return (
            <EditorFrame topBarStart={frame.topBarStart} topBarEnd={frame.topBarEnd} fullWidth={frame.fullWidth}>
                {frame.renderHeader(false)}
                <p className="px-[var(--page-gutter)] text-sm text-muted-foreground">Dokument wird geladen …</p>
            </EditorFrame>
        );
    }

    if ("error" in loadResult) {
        return (
            <EditorFrame topBarStart={frame.topBarStart} topBarEnd={frame.topBarEnd} fullWidth={frame.fullWidth}>
                {frame.renderHeader(false)}
                <p className="px-[var(--page-gutter)] text-sm text-destructive" role="alert">
                    {loadResult.error}
                </p>
            </EditorFrame>
        );
    }

    return (
        <EditorContent
            key={pageId}
            userId={user.id}
            pageId={pageId}
            initial={loadResult.initial}
            store={store}
            {...frame}
        />
    );
}
