// Uploads in progress, for the notice at the bottom of the app (package 39).
// Outside React, since uploads start in the editor, the cover, the files of
// an entry and the import.

export type UploadState = { id: number; name: string; /** 0–1 */ progress: number };

let uploads: readonly UploadState[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function publish(next: readonly UploadState[]): void {
    uploads = next;
    for (const listener of listeners) listener();
}

/** Starts showing an upload; returns how to report its progress and its end. */
export function trackUpload(name: string): { progress: (fraction: number) => void; done: () => void } {
    const id = nextId++;
    publish([...uploads, { id, name, progress: 0 }]);
    return {
        progress: (fraction) =>
            publish(
                uploads.map((upload) =>
                    upload.id === id ? { ...upload, progress: Math.min(1, Math.max(0, fraction)) } : upload,
                ),
            ),
        done: () => publish(uploads.filter((upload) => upload.id !== id)),
    };
}

export function subscribeUploads(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export const uploadsSnapshot = (): readonly UploadState[] => uploads;
