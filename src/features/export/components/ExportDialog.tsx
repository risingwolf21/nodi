import { useEffect, useState } from "react";
import { zipSync } from "fflate";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { databaseRepository } from "@/features/databases/services/database-repository";
import { remoteDocumentRepository } from "@/features/editor/services/remote-document-repository";
import { localDocumentStoreFor } from "@/features/editor/services/local-document-store";
import { downloadPageFile } from "@/features/files/services/page-files";
import type { Page } from "@/features/pages/types";
import { blocksToMarkdown } from "../blocks-to-markdown";
import { buildExport, type ExportProgress, type ExportResult } from "../build-export";
import { safeName } from "../export-tree";

type ExportDialogProps = {
    userId: string;
    /** The pages of the workspace; what is below the roots is found in them. */
    pages: readonly Page[];
    rootIds: readonly string[];
    /** "Workspace „Team“" or "Seite „Reise“": what is exported, shown in the dialog. */
    label: string;
    /** Name of the ZIP file without extension. */
    fileName: string;
    onClose: () => void;
};

type ExportState =
    | { kind: "ready" }
    | { kind: "running"; progress: ExportProgress }
    | { kind: "done"; result: ExportResult; url: string }
    | { kind: "failed"; message: string };

const today = () => new Date().toISOString().slice(0, 10);

/** Export as Markdown and files in a ZIP, readable by nodi's import (packages 34a, 34b). Loaded on demand. */
export default function ExportDialog({ userId, pages, rootIds, label, fileName, onClose }: ExportDialogProps) {
    const [state, setState] = useState<ExportState>({ kind: "ready" });
    const zipName = `${safeName(fileName)} ${today()}.zip`;
    const doneUrl = state.kind === "done" ? state.url : null;

    useEffect(() => (doneUrl ? () => URL.revokeObjectURL(doneUrl) : undefined), [doneUrl]);

    async function start() {
        setState({ kind: "running", progress: { done: 0, total: 0, title: "" } });
        const store = localDocumentStoreFor(userId);
        try {
            const result = await buildExport(
                pages,
                rootIds,
                {
                    // The copy on this device may hold edits the server has not seen yet.
                    loadDocument: async (pageId) =>
                        (await store.get(pageId))?.content ??
                        (await remoteDocumentRepository.fetch(pageId)).document?.content ??
                        [],
                    loadDatabase: (databaseId) => databaseRepository.load(databaseId),
                    downloadFile: downloadPageFile,
                    blocksToMarkdown,
                },
                (progress) => setState({ kind: "running", progress }),
            );
            const zip = zipSync(Object.fromEntries(result.files));
            const url = URL.createObjectURL(new Blob([zip], { type: "application/zip" }));
            setState({ kind: "done", result, url });
            download(url, zipName);
        } catch (err) {
            console.error("Export fehlgeschlagen:", err);
            setState({
                kind: "failed",
                message: err instanceof Error ? err.message : "Der Export ist fehlgeschlagen.",
            });
        }
    }

    const running = state.kind === "running";

    return (
        <Dialog labelledBy="export-title" onClose={onClose} busy={running} className="w-[min(32rem,calc(100vw-2rem))]">
            <h2 id="export-title" className="text-lg font-semibold">
                Exportieren
            </h2>
            <p className="text-sm text-muted-foreground">
                {label} mit allen Unterseiten, Datenbanken, Bildern und Anhängen als ZIP-Datei mit Markdown und CSV, wie
                ein Notion-Export. nodi kann sie über „Aus Notion importieren“ wieder einlesen.
            </p>

            {state.kind === "running" && (
                <p role="status" className="text-sm">
                    {state.progress.total > 0
                        ? `Seite ${Math.min(state.progress.done + 1, state.progress.total)} von ${state.progress.total} …`
                        : "Wird vorbereitet …"}
                </p>
            )}
            {state.kind === "done" && (
                <div role="status" className="space-y-2 text-sm">
                    <p>
                        Fertig: {state.result.pages === 1 ? "1 Seite" : `${state.result.pages} Seiten`},{" "}
                        {state.result.databases > 0 &&
                            `${state.result.databases === 1 ? "1 Datenbank" : `${state.result.databases} Datenbanken`}, `}
                        {state.result.attachments === 1 ? "1 Datei" : `${state.result.attachments} Dateien`}.
                    </p>
                    {state.result.problems.length > 0 && (
                        <ul className="max-h-40 list-disc space-y-1 overflow-y-auto pl-5 text-muted-foreground">
                            {state.result.problems.map((problem) => (
                                <li key={problem}>{problem}</li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
            {state.kind === "failed" && (
                <p role="alert" className="text-sm text-destructive">
                    {state.message}
                </p>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={onClose} disabled={running}>
                    {state.kind === "done" ? "Schließen" : "Abbrechen"}
                </Button>
                {state.kind === "done" ? (
                    <Button type="button" onClick={() => download(state.url, zipName)}>
                        Erneut herunterladen
                    </Button>
                ) : (
                    <Button type="button" onClick={() => void start()} disabled={running}>
                        {running ? "Wird exportiert …" : "Exportieren"}
                    </Button>
                )}
            </div>
        </Dialog>
    );
}

function download(url: string, name: string) {
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
}
