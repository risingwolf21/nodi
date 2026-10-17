
import { useCallback, useEffect, useRef, useState } from "react";
import {
    useCreateBlockNote,
    useEditorChange,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import type { PartialBlock } from "@blocknote/core";
import "@blocknote/mantine/style.css";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/use-auth";

type BlockEditorProps = {
    pageId: string;
};

type PageDocument = {
    document: PartialBlock[];
};

type LoadResult = {
    pageId: string;
    content?: PartialBlock[];
    error?: string;
};

function EditorContent({
    pageId,
    initialContent,
}: {
    pageId: string;
    initialContent: PartialBlock[];
}) {
    const { user } = useAuth();

    const [saveStatus, setSaveStatus] = useState("Gespeichert");
    const [saveError, setSaveError] = useState("");

    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const saveVersion = useRef(0);
    const dirty = useRef(false);
    const mounted = useRef(false);

    const latestDocument = useRef<PartialBlock[]>(initialContent);

    // Alle Schreibvorgänge werden nacheinander ausgeführt.
    // So kann ein älterer Schreibvorgang keinen neueren überschreiben.
    const saveQueue = useRef<Promise<void>>(Promise.resolve());

    const editor = useCreateBlockNote({
        initialContent:
            initialContent.length > 0 ? initialContent : undefined,
    });

    const saveDocument = useCallback(
        async (document: PartialBlock[], version: number) => {
            if (!user) return;

            // Momentaufnahme erstellen, damit spätere Editor-Änderungen
            // den bereits geplanten Schreibvorgang nicht beeinflussen.
            const snapshot = JSON.parse(
                JSON.stringify(document),
            ) as PartialBlock[];

            if (mounted.current) {
                setSaveStatus("Speichert …");
            }

            const write = saveQueue.current.then(async () => {
                const { error } = await supabase
                    .from("page_documents")
                    .upsert(
                        {
                            page_id: pageId,
                            document: snapshot,
                            updated_at: new Date().toISOString(),
                            updated_by: user.id,
                        },
                        { onConflict: "page_id" },
                    );

                if (error) throw error;
            });

            // Die Warteschlange bleibt auch nach einem fehlgeschlagenen
            // Schreibvorgang für weitere Speicherungen verwendbar.
            saveQueue.current = write.catch(() => undefined);

            try {
                await write;

                // Nur den neuesten Stand als gespeichert markieren.
                if (
                    !mounted.current ||
                    version !== saveVersion.current
                ) {
                    return;
                }

                dirty.current = false;
                setSaveError("");
                setSaveStatus("Gespeichert");
            } catch (error) {
                console.error("Fehler beim Speichern:", error);

                if (
                    !mounted.current ||
                    version !== saveVersion.current
                ) {
                    return;
                }

                setSaveError(
                    error instanceof Error
                        ? error.message
                        : "Unbekannter Speicherfehler",
                );
                setSaveStatus("Speichern fehlgeschlagen");
            }
        },
        [pageId, user],
    );

    const flushSave = useCallback(async () => {
        if (!user || !dirty.current) return;

        await saveDocument(
            latestDocument.current,
            saveVersion.current,
        );
    }, [saveDocument, user]);

    useEffect(() => {
        mounted.current = true;

        return () => {
            mounted.current = false;

            if (timer.current) {
                clearTimeout(timer.current);
                timer.current = null;
            }

            // Ausstehende Änderungen beim Verlassen des Editors
            // sofort an Supabase übergeben, statt sie zu verwerfen.
            if (dirty.current) {
                void flushSave();
            }
        };
    }, [flushSave]);

    useEditorChange(() => {
        if (!user) return;

        latestDocument.current = editor.document;
        dirty.current = true;

        const version = ++saveVersion.current;

        setSaveStatus("Änderungen ausstehend");
        setSaveError("");

        if (timer.current) {
            clearTimeout(timer.current);
        }

        timer.current = setTimeout(() => {
            timer.current = null;

            void saveDocument(
                latestDocument.current,
                version,
            );
        }, 800);
    }, editor);

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex justify-end border-b px-6 py-2">
                <span
                    className="text-xs text-muted-foreground"
                    role="status"
                    aria-live="polite"
                >
                    {saveStatus}
                </span>
            </div>

            {saveError && (
                <div className="flex items-center justify-between gap-4 px-6 pt-3">
                    <p
                        className="text-sm text-destructive"
                        role="alert"
                    >
                        Speichern fehlgeschlagen: {saveError}
                    </p>

                    <button
                        type="button"
                        className="shrink-0 text-sm underline"
                        onClick={() => {
                            void flushSave();
                        }}
                    >
                        Erneut versuchen
                    </button>
                </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-4 sm:px-6 sm:py-8">
                <div className="mx-auto max-w-3xl">
                    <BlockNoteView editor={editor} />
                </div>
            </div>
        </div>
    );
}

export default function BlockEditor({ pageId }: BlockEditorProps) {
    const [loadResult, setLoadResult] = useState<LoadResult | null>(
        null,
    );

    useEffect(() => {
        let active = true;

        async function loadDocument() {
            const { data, error } = await supabase
                .from("page_documents")
                .select("document")
                .eq("page_id", pageId)
                .maybeSingle();

            if (!active) return;

            if (error) {
                setLoadResult({
                    pageId,
                    error: error.message,
                });
                return;
            }

            const document = (data as PageDocument | null)?.document;

            setLoadResult({
                pageId,
                content: Array.isArray(document) ? document : [],
            });
        }

        void loadDocument();

        return () => {
            active = false;
        };
    }, [pageId]);

    // Das Ergebnis der vorherigen Seite während des Ladens ignorieren.
    // Dadurch muss der Effect keinen synchronen Reset ausführen.
    if (!loadResult || loadResult.pageId !== pageId) {
        return (
            <p className="p-6 text-sm text-muted-foreground">
                Dokument wird geladen …
            </p>
        );
    }

    if (loadResult.error) {
        return (
            <p className="p-6 text-sm text-destructive" role="alert">
                Das Dokument konnte nicht geladen werden:{" "}
                {loadResult.error}
            </p>
        );
    }

    return (
        <EditorContent
            key={pageId}
            pageId={pageId}
            initialContent={loadResult.content ?? []}
        />
    );
}
