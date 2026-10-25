import { classifyRequestError, RemoteRequestError } from "@/lib/request-errors";
import { supabase } from "@/lib/supabase";
import { fileReference, fileStoragePath, MAX_FILE_BYTES } from "../file-reference";

const BUCKET = "page-files";
// Used once right away (download or display), so a short lifetime suffices.
const SIGNED_URL_SECONDS = 60 * 60;

/** storage-js reports HTTP errors with a status; anything else is a failed request. */
function toStorageError(error: unknown, message: string): RemoteRequestError {
    const status =
        typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
            ? error.status
            : 0;
    const reason = status === 0 ? "offline" : classifyRequestError({ status });
    return new RemoteRequestError(reason, reason === "offline" ? `${message} Keine Internetverbindung.` : message);
}

/** Uploads a file of a page and returns the reference stored in the document. */
export async function uploadPageFile(pageId: string, file: File): Promise<string> {
    if (file.size > MAX_FILE_BYTES) {
        throw new RemoteRequestError("permanent", "Die Datei ist größer als 10 MB.");
    }
    const path = fileStoragePath(pageId, file.name);
    const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (error) {
        console.error("Datei konnte nicht hochgeladen werden:", error);
        throw toStorageError(error, "Die Datei konnte nicht hochgeladen werden.");
    }
    return fileReference(path);
}

/**
 * A URL to read the file for a short time; Storage checks the rights of the
 * page. Without a session (public view) the public link decides.
 */
export async function signedFileUrl(path: string): Promise<string> {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
    if (error) throw toStorageError(error, "Die Datei konnte nicht geladen werden.");
    return data.signedUrl;
}

/** The content of a file, for the export (package 34a). */
export async function downloadPageFile(path: string): Promise<Uint8Array> {
    const url = await signedFileUrl(path);
    let response: Response;
    try {
        response = await fetch(url);
    } catch {
        throw new RemoteRequestError("offline", "Die Datei konnte nicht geladen werden. Keine Internetverbindung.");
    }
    if (!response.ok) {
        throw new RemoteRequestError(
            classifyRequestError({ status: response.status }),
            "Die Datei konnte nicht geladen werden.",
        );
    }
    return new Uint8Array(await response.arrayBuffer());
}
