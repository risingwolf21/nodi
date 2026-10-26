import { useSyncExternalStore } from "react";
import { subscribeUploads, uploadsSnapshot } from "../services/upload-progress";

/** At the bottom of the app while files are uploaded (package 39). */
export function UploadProgress() {
    const uploads = useSyncExternalStore(subscribeUploads, uploadsSnapshot);
    if (uploads.length === 0) return null;
    const percent = Math.round((uploads.reduce((sum, upload) => sum + upload.progress, 0) / uploads.length) * 100);
    const label =
        uploads.length === 1
            ? `„${uploads[0].name}“ wird hochgeladen …`
            : `${uploads.length} Dateien werden hochgeladen …`;

    return (
        <div
            role="status"
            aria-label="Hochladen"
            className="fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 flex justify-center px-4"
        >
            <div className="w-full max-w-sm rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
                <div className="flex items-center justify-between gap-3">
                    <span className="truncate">{label}</span>
                    <span className="shrink-0 tabular-nums">{percent} %</span>
                </div>
                <div
                    className="mt-1.5 h-1 overflow-hidden rounded bg-muted"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                >
                    <div className="h-full bg-brand transition-[width]" style={{ width: `${percent}%` }} />
                </div>
            </div>
        </div>
    );
}
