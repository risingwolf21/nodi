import { filePathFromReference, isImagePath } from "../file-reference";

type ImageCache = {
    get(path: string): Promise<Blob | null>;
    put(path: string, file: Blob): Promise<void>;
};

type ResolverOptions = {
    signedUrl: (path: string) => Promise<string>;
    /** Without a cache (public view) nothing is kept on the device. */
    cache?: ImageCache;
    fetchFile?: (url: string) => Promise<Response>;
    createObjectUrl?: (file: Blob) => string;
};

/**
 * For BlockNote's `resolveFileUrl`: turns a `nodi-file:` reference into a URL
 * the browser can load. Images come from the cache first, so pages read
 * offline still show them; other attachments get a fresh signed URL each
 * time they are opened. URLs from elsewhere stay as they are.
 */
export function createFileUrlResolver({
    signedUrl,
    cache,
    fetchFile = (url) => fetch(url),
    createObjectUrl = (file) => URL.createObjectURL(file),
}: ResolverOptions): (url: string) => Promise<string> {
    // One object URL per image while the editor is open.
    const objectUrls = new Map<string, string>();

    const toObjectUrl = (path: string, file: Blob) => {
        const url = createObjectUrl(file);
        objectUrls.set(path, url);
        return url;
    };

    return async (url) => {
        const path = filePathFromReference(url);
        if (path === null) return url;
        if (!cache || !isImagePath(path)) return signedUrl(path);

        const known = objectUrls.get(path);
        if (known) return known;

        const cached = await cache.get(path).catch((error: unknown) => {
            // Without the cache the image still loads from the server.
            console.warn("Bild-Cache nicht lesbar:", error);
            return null;
        });
        if (cached) return toObjectUrl(path, cached);

        const response = await fetchFile(await signedUrl(path));
        if (!response.ok) throw new Error(`Das Bild konnte nicht geladen werden (${response.status}).`);
        const file = await response.blob();
        await cache.put(path, file).catch((error: unknown) => {
            console.warn("Bild konnte nicht für offline gespeichert werden:", error);
        });
        return toObjectUrl(path, file);
    };
}
