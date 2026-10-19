// Files of a page live in the Storage bucket `page-files` under
// `<page id>/<random id>-<file name>` (migration 20261019120000). Documents
// keep a stable reference instead of a URL, because signed URLs expire:
// `nodi-file:<path>`. The editor resolves it when it shows the file.

export const FILE_REFERENCE_PREFIX = "nodi-file:";

/** As the bucket's file_size_limit (decision of the user, CLAUDE.md §12 P15). */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PATH_PATTERN = new RegExp(`^(${UUID})/${UUID}-[A-Za-z0-9._-]{1,100}$`);
const MAX_NAME_LENGTH = 100;
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "bmp"]);

/**
 * A file name Storage accepts and that is safe in a path: no folders,
 * umlauts become their base letter, anything else unusual a hyphen.
 */
export function safeFileName(name: string): string {
    const base = name.split(/[\\/]/).pop() ?? "";
    const ascii = base.normalize("NFKD").replace(/\p{M}/gu, "").replace(/ß/g, "ss");
    const cleaned = ascii
        .replace(/[^A-Za-z0-9._-]+/g, "-")
        .replace(/-{2,}/g, "-")
        .replace(/^[-.]+/, "");
    if (!cleaned) return "datei";
    if (cleaned.length <= MAX_NAME_LENGTH) return cleaned;
    // Keep the extension, it decides how the file is shown.
    const dot = cleaned.lastIndexOf(".");
    const extension = dot > 0 && cleaned.length - dot <= 10 ? cleaned.slice(dot) : "";
    return cleaned.slice(0, MAX_NAME_LENGTH - extension.length) + extension;
}

export function fileStoragePath(pageId: string, fileName: string, id: string = crypto.randomUUID()): string {
    return `${pageId}/${id}-${safeFileName(fileName)}`;
}

export function fileReference(path: string): string {
    return FILE_REFERENCE_PREFIX + path;
}

/** The storage path of a reference; null for other URLs (e.g. images from the web). */
export function filePathFromReference(url: string): string | null {
    if (!url.startsWith(FILE_REFERENCE_PREFIX)) return null;
    const path = url.slice(FILE_REFERENCE_PREFIX.length);
    return PATH_PATTERN.test(path) ? path : null;
}

export function pageIdOfFilePath(path: string): string | null {
    return PATH_PATTERN.exec(path)?.[1] ?? null;
}

/** Images are kept for offline use; other attachments are only downloaded on request. */
export function isImagePath(path: string): boolean {
    const extension = path.split(".").pop()?.toLowerCase() ?? "";
    return IMAGE_EXTENSIONS.has(extension);
}
