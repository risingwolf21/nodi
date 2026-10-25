import { useRef, useState } from "react";
import { Paperclip, Upload, X } from "lucide-react";
import { Menu } from "@/components/ui/menu";
import { fileNameOfPath, filePathFromReference } from "@/features/files/file-reference";
import { signedFileUrl, uploadPageFile } from "@/features/files/services/page-files";

/** As the server allows (`is_valid_property_value`, package 29). */
const MAX_FILES = 100;

type FilesPickerProps = {
    label: string;
    /** The entry: files are uploaded into its folder (package 15). */
    pageId: string;
    paths: string[];
    editable: boolean;
    onClose: () => void;
    onChange: (paths: string[]) => void;
    onError: (message: string) => void;
};

/** The files of a "Dateien & Medien" value: open, remove, upload (package 29). */
export function FilesPicker({ label, pageId, paths, editable, onClose, onChange, onError }: FilesPickerProps) {
    const input = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    async function open(path: string) {
        try {
            window.open(await signedFileUrl(path), "_blank", "noopener");
        } catch (err) {
            onError(err instanceof Error ? err.message : "Die Datei konnte nicht geöffnet werden.");
        }
    }

    async function upload(files: File[]) {
        if (paths.length + files.length > MAX_FILES) {
            onError(`Höchstens ${MAX_FILES} Dateien je Wert.`);
            return;
        }
        setUploading(true);
        const added: string[] = [];
        try {
            for (const file of files) {
                const path = filePathFromReference(await uploadPageFile(pageId, file));
                if (path) added.push(path);
            }
        } catch (err) {
            onError(err instanceof Error ? err.message : "Die Datei konnte nicht hochgeladen werden.");
        } finally {
            setUploading(false);
            // Files uploaded before a failure are kept.
            if (added.length > 0) onChange([...paths, ...added]);
        }
    }

    return (
        <Menu detached open onClose={onClose} align="start" role="dialog" label={label} className="w-64">
            <ul className="max-h-60 overflow-y-auto py-1">
                {paths.map((path) => (
                    <li key={path} className="flex items-center gap-1 px-1">
                        <button
                            type="button"
                            onClick={() => void open(path)}
                            className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left text-sm hover:bg-accent pointer-coarse:py-2"
                        >
                            <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                            <span className="truncate">{fileNameOfPath(path)}</span>
                        </button>
                        {editable && (
                            <button
                                type="button"
                                aria-label={`${fileNameOfPath(path)} entfernen`}
                                onClick={() => onChange(paths.filter((item) => item !== path))}
                                className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent pointer-coarse:size-9"
                            >
                                <X className="size-3.5" />
                            </button>
                        )}
                    </li>
                ))}
                {paths.length === 0 && <li className="px-2 py-1 text-xs text-muted-foreground">Keine Dateien.</li>}
            </ul>
            {editable && (
                <>
                    <input
                        ref={input}
                        type="file"
                        multiple
                        hidden
                        aria-label="Datei auswählen"
                        onChange={(event) => {
                            const files = [...(event.target.files ?? [])];
                            event.target.value = "";
                            if (files.length > 0) void upload(files);
                        }}
                    />
                    <button
                        type="button"
                        disabled={uploading}
                        onClick={() => input.current?.click()}
                        className="flex w-full items-center gap-2 rounded border-t px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent disabled:opacity-60"
                    >
                        <Upload className="size-3.5" aria-hidden="true" />
                        {uploading ? "Wird hochgeladen …" : "Datei hochladen (höchstens 10 MB)"}
                    </button>
                </>
            )}
        </Menu>
    );
}
