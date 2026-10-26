import { classifyRequestError, RemoteRequestError } from "@/lib/request-errors";
import { supabase, supabasePublishableKey, supabaseUrl } from "@/lib/supabase";
import { fileReference, fileStoragePath, MAX_FILE_BYTES } from "../file-reference";
import { shrinkImage } from "../image-resize";
import { trackUpload } from "./upload-progress";

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

/**
 * Sends the file as storage-js does, but with XMLHttpRequest: fetch reports
 * no upload progress (package 39).
 */
function sendFile(path: string, file: File, accessToken: string, onProgress: (fraction: number) => void) {
    return new Promise<void>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("POST", `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/${BUCKET}/${path}`);
        request.setRequestHeader("apikey", supabasePublishableKey);
        request.setRequestHeader("Authorization", `Bearer ${accessToken}`);
        request.setRequestHeader("x-upsert", "false");
        request.upload.onprogress = (event) => {
            if (event.lengthComputable) onProgress(event.loaded / event.total);
        };
        const fail = (status: number) => {
            console.error("Datei konnte nicht hochgeladen werden:", status, request.responseText);
            reject(toStorageError({ status }, "Die Datei konnte nicht hochgeladen werden."));
        };
        request.onload = () => (request.status >= 200 && request.status < 300 ? resolve() : fail(request.status));
        request.onerror = () => fail(0);
        const form = new FormData();
        form.append("cacheControl", "3600");
        form.append("", file);
        request.send(form);
    });
}

/**
 * Uploads a file of a page and returns the reference stored in the document.
 * Photos are made smaller first (package 39); the notice at the bottom shows
 * the progress.
 */
export async function uploadPageFile(pageId: string, original: File): Promise<string> {
    const file = await shrinkImage(original);
    if (file.size > MAX_FILE_BYTES) {
        throw new RemoteRequestError("permanent", "Die Datei ist größer als 10 MB.");
    }
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) throw new RemoteRequestError("auth", "Bitte melde dich erneut an, um Dateien hochzuladen.");

    const path = fileStoragePath(pageId, file.name);
    const upload = trackUpload(file.name);
    try {
        await sendFile(path, file, accessToken, upload.progress);
    } finally {
        upload.done();
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

/** Copies a file to another path, e.g. a template's file to a new page (package 38b); Storage checks both pages. */
export async function copyPageFile(from: string, to: string): Promise<void> {
    const { error } = await supabase.storage.from(BUCKET).copy(from, to);
    if (error) {
        console.error("Datei konnte nicht kopiert werden:", error);
        throw toStorageError(error, "Die Dateien der Vorlage konnten nicht kopiert werden.");
    }
}
