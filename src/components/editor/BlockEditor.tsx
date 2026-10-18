import { useEffect, useRef, useState } from "react";
import {
    useCreateBlockNote,
    useEditorChange,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";

import { useAuth } from "@/lib/use-auth";
import { RemoteRequestError } from "@/lib/request-errors";
import { syncEngineFor } from "@/features/editor/services/account-sync";
import { documentChangesFor } from "@/features/editor/services/document-changes";
import {
    localDocumentStoreFor,
    type LocalDocumentStore,
} from "@/features/editor/services/local-document-store";
import {
    loadInitialDocument,
    PageDocumentSession,
    type InitialDocument,
    type SessionStatus,
} from "@/features/editor/services/page-document-session";
import { remoteDocumentRepository } from "@/features/editor/services/remote-document-repository";
import type { DocumentContent } from "@/features/editor/types";

type BlockEditorProps = {
    pageId: string;
};

type LoadResult =
    | { pageId: string; initial: InitialDocument }
    | { pageId: string; error: string };

// Long enough to read, short enough not to get in the way (Option A).
const SUPERSEDED_NOTICE_MS = 8000;

const SUPERSEDED_NOTICE =
    "Diese Seite wurde auf einem anderen Gerät geändert. Die neuere Version wurde geladen.";

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
    }
}

function loadErrorMessage(error: unknown): string {
    if (error instanceof RemoteRequestError && error.reason === "offline") {
        return "Diese Seite ist offline noch nicht verfügbar. Öffne sie einmal mit Internetverbindung, dann ist sie auch offline lesbar.";
    }
    return `Das Dokument konnte nicht geladen werden: ${
        error instanceof Error ? error.message : "Unbekannter Fehler"
    }`;
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
}: {
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
        initialContent:
            initial.document.content.length > 0
                ? initial.document.content
                : undefined,
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

        const timer = setTimeout(
            () => setShowSupersededNotice(false),
            SUPERSEDED_NOTICE_MS,
        );
        return () => clearTimeout(timer);
    }, [showSupersededNotice]);

    useEditorChange(() => {
        if (applyingRemoteContent.current) return;
        session.current?.recordEdit(editor.document);
    }, editor);

    const canRetry = status.kind === "error" || status.kind === "unsynced";

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex justify-end gap-3 border-b px-6 py-2">
                {canEdit === false && (
                    <span className="text-xs text-muted-foreground">
                        Nur Lesezugriff
                    </span>
                )}
                <span
                    className="text-xs text-muted-foreground"
                    role="status"
                    aria-live="polite"
                >
                    {statusText(status)}
                </span>
            </div>

            {showSupersededNotice && (
                <p
                    className="px-6 pt-3 text-sm text-muted-foreground"
                    role="status"
                >
                    {SUPERSEDED_NOTICE}
                </p>
            )}

            {canRetry && (
                <div className="flex items-center justify-between gap-4 px-6 pt-3">
                    <p
                        className={
                            status.kind === "error"
                                ? "text-sm text-destructive"
                                : "text-sm text-muted-foreground"
                        }
                        role={status.kind === "error" ? "alert" : undefined}
                    >
                        {status.kind === "error"
                            ? `Speichern fehlgeschlagen: ${status.message}. Die Änderung bleibt auf diesem Gerät gespeichert.`
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

            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-4 sm:px-6 sm:py-8">
                <div className="mx-auto max-w-3xl">
                    <BlockNoteView
                        editor={editor}
                        editable={canEdit !== false}
                    />
                </div>
            </div>
        </div>
    );
}

export default function BlockEditor({ pageId }: BlockEditorProps) {
    const { user } = useAuth();
    const store = user ? localDocumentStoreFor(user.id) : null;

    const [loadResult, setLoadResult] = useState<LoadResult | null>(
        null,
    );

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

    // Das Ergebnis der vorherigen Seite während des Ladens ignorieren.
    // Dadurch muss der Effect keinen synchronen Reset ausführen.
    if (!user || !store || !loadResult || loadResult.pageId !== pageId) {
        return (
            <p className="p-6 text-sm text-muted-foreground">
                Dokument wird geladen …
            </p>
        );
    }

    if ("error" in loadResult) {
        return (
            <p className="p-6 text-sm text-destructive" role="alert">
                {loadResult.error}
            </p>
        );
    }

    return (
        <EditorContent
            key={pageId}
            userId={user.id}
            pageId={pageId}
            initial={loadResult.initial}
            store={store}
        />
    );
}
