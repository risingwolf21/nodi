import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { remoteDocumentRepository } from "@/features/editor/services/remote-document-repository";
import { uploadPageFile } from "@/features/files/services/page-files";
import { markdownToBlocks } from "../markdown-to-blocks";
import { importNotionExport, type ImportSummary } from "../notion-import";
import { readExportArchive } from "../read-archive";

type NotionImportDialogProps = {
    /** A private page of the current workspace (usePages.createPage). */
    createPage: (title: string, parentId: string | null) => Promise<{ id: string }>;
    onOpen: (pageId: string) => void;
    onClose: () => void;
};

type Phase =
    | { kind: "choose" }
    | { kind: "reading" }
    | { kind: "importing"; done: number; total: number; title: string }
    | { kind: "finished"; summary: ImportSummary };

// Shown in full up to this many; the rest is counted.
const MAX_LISTED_PROBLEMS = 20;

async function saveDocument(pageId: string, content: Parameters<typeof remoteDocumentRepository.save>[1]) {
    const result = await remoteDocumentRepository.save(pageId, content, {
        editedAt: new Date().toISOString(),
        mutationId: crypto.randomUUID(),
    });
    if (result.kind === "failed") throw new Error(`Der Text konnte nicht gespeichert werden: ${result.message}`);
}

/** Notion export (ZIP, "Markdown & CSV") → pages below "Notion-Import" (CLAUDE.md §12 P16a). */
export default function NotionImportDialog({ createPage, onOpen, onClose }: NotionImportDialogProps) {
    const [file, setFile] = useState<File | null>(null);
    const [phase, setPhase] = useState<Phase>({ kind: "choose" });
    const [error, setError] = useState("");
    const cancel = useRef<AbortController | null>(null);
    const busy = phase.kind === "reading" || phase.kind === "importing";

    async function start() {
        if (!file) return;
        setError("");
        setPhase({ kind: "reading" });
        let archive: Map<string, Uint8Array>;
        try {
            archive = await readExportArchive(file);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Die Datei konnte nicht gelesen werden.");
            setPhase({ kind: "choose" });
            return;
        }

        cancel.current = new AbortController();
        const summary = await importNotionExport(archive, {
            createPage,
            saveDocument,
            uploadFile: uploadPageFile,
            markdownToBlocks,
            signal: cancel.current.signal,
            onProgress: (progress) => setPhase({ kind: "importing", ...progress }),
        });
        setPhase({ kind: "finished", summary });
    }

    return (
        <Dialog
            labelledBy="notion-import-title"
            onClose={onClose}
            busy={busy}
            className="w-[min(36rem,calc(100vw-2rem))]"
        >
            <h2 id="notion-import-title" className="text-lg font-semibold">
                Aus Notion importieren
            </h2>

            {(phase.kind === "choose" || phase.kind === "reading") && (
                <>
                    <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                        <li>
                            In Notion eine Seite über „…“ → „Exportieren“ exportieren oder in den Einstellungen alle
                            Inhalte des Workspace.
                        </li>
                        <li>
                            Format „Markdown &amp; CSV“ wählen und Unterseiten einbeziehen. Notion schickt eine
                            ZIP-Datei.
                        </li>
                        <li>Die ZIP-Datei hier auswählen, ohne sie zu entpacken.</li>
                    </ol>
                    <p className="text-sm text-muted-foreground">
                        Alles kommt unter eine neue private Seite „Notion-Import“. Bilder und Anhänge bis 10 MB werden
                        übernommen. Datenbanken folgen mit einem späteren Import.
                    </p>
                    <input
                        type="file"
                        accept=".zip,application/zip"
                        aria-label="Notion-Export (ZIP)"
                        disabled={busy}
                        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                        className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-transparent file:px-3 file:py-1.5 file:text-sm"
                    />
                    {error && (
                        <p role="alert" className="text-sm text-destructive">
                            {error}
                        </p>
                    )}
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                            Abbrechen
                        </Button>
                        <Button type="button" onClick={() => void start()} disabled={!file || busy}>
                            {phase.kind === "reading" ? "Datei wird gelesen …" : "Importieren"}
                        </Button>
                    </div>
                </>
            )}

            {phase.kind === "importing" && (
                <div className="space-y-3">
                    <p className="text-sm" role="status">
                        Seite {Math.min(phase.done + 1, phase.total)} von {phase.total}
                        {phase.title && <span className="text-muted-foreground"> – {phase.title}</span>}
                    </p>
                    <progress className="w-full" max={phase.total} value={phase.done} aria-label="Fortschritt" />
                    <div className="flex justify-end">
                        <Button type="button" variant="outline" onClick={() => cancel.current?.abort()}>
                            Nach dieser Seite anhalten
                        </Button>
                    </div>
                </div>
            )}

            {phase.kind === "finished" && <ImportResult summary={phase.summary} onOpen={onOpen} onClose={onClose} />}
        </Dialog>
    );
}

function ImportResult({
    summary,
    onOpen,
    onClose,
}: {
    summary: ImportSummary;
    onOpen: (pageId: string) => void;
    onClose: () => void;
}) {
    const { rootPageId } = summary;
    return (
        <div className="space-y-3 text-sm">
            <p role="status">
                {summary.pages} von {summary.plannedPages} Seiten importiert, {summary.files}{" "}
                {summary.files === 1 ? "Datei" : "Dateien"} übernommen.
                {summary.cancelled && " Der Import wurde angehalten."}
            </p>
            {summary.error && (
                <p role="alert" className="text-destructive">
                    {summary.error}
                    {rootPageId && " Bereits Importiertes liegt unter „Notion-Import“."}
                </p>
            )}
            {summary.databases.length > 0 && (
                <p className="text-muted-foreground">
                    Noch nicht übernommen ({summary.databases.length}{" "}
                    {summary.databases.length === 1 ? "Datenbank" : "Datenbanken"}):{" "}
                    {summary.databases.map((database) => database.title).join(", ")}.
                </p>
            )}
            {summary.problems.length > 0 && (
                <details>
                    <summary className="cursor-pointer text-muted-foreground">
                        {summary.problems.length} {summary.problems.length === 1 ? "Hinweis" : "Hinweise"}
                    </summary>
                    <ul className="mt-1 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5 text-muted-foreground">
                        {summary.problems.slice(0, MAX_LISTED_PROBLEMS).map((problem, index) => (
                            <li key={index}>{problem}</li>
                        ))}
                        {summary.problems.length > MAX_LISTED_PROBLEMS && (
                            <li>… und {summary.problems.length - MAX_LISTED_PROBLEMS} weitere</li>
                        )}
                    </ul>
                </details>
            )}
            <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={onClose}>
                    Schließen
                </Button>
                {rootPageId && (
                    <Button
                        type="button"
                        onClick={() => {
                            onClose();
                            onOpen(rootPageId);
                        }}
                    >
                        Öffnen
                    </Button>
                )}
            </div>
        </div>
    );
}
