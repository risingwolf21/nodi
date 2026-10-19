import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import { fileReference } from "../file-reference";
import { FileCache } from "./file-cache";
import { createFileUrlResolver } from "./file-url-resolver";

const PAGE = "b0000000-0000-4000-8000-000000000001";
const OTHER_PAGE = "b0000000-0000-4000-8000-000000000002";
const image = `${PAGE}/c0000000-0000-4000-8000-000000000003-foto.png`;
const pdf = `${PAGE}/c0000000-0000-4000-8000-000000000004-plan.pdf`;

function setup() {
    const cache = new FileCache("user-1", new IDBFactory());
    const signedUrl = vi.fn(async (path: string) => `https://storage.test/${path}?token=x`);
    const fetchFile = vi.fn(async () => new Response(new Blob(["png"], { type: "image/png" })));
    let created = 0;
    const resolve = createFileUrlResolver({
        signedUrl,
        cache,
        fetchFile,
        createObjectUrl: () => `blob:${(created += 1)}`,
    });
    return { cache, signedUrl, fetchFile, resolve };
}

describe("createFileUrlResolver", () => {
    it("leaves URLs from elsewhere unchanged", async () => {
        const { resolve, signedUrl } = setup();
        expect(await resolve("https://example.com/bild.png")).toBe("https://example.com/bild.png");
        expect(signedUrl).not.toHaveBeenCalled();
    });

    it("loads an image once, keeps it for offline use and reuses it", async () => {
        const { resolve, cache, fetchFile } = setup();
        expect(await resolve(fileReference(image))).toBe("blob:1");
        expect(await resolve(fileReference(image))).toBe("blob:1");
        expect(fetchFile).toHaveBeenCalledTimes(1);
        expect(await cache.get(image)).toBeInstanceOf(Blob);

        // A new editor (e.g. offline after a restart) reads it from the cache.
        const offline = createFileUrlResolver({
            signedUrl: () => Promise.reject(new Error("offline")),
            cache,
            createObjectUrl: () => "blob:offline",
        });
        expect(await offline(fileReference(image))).toBe("blob:offline");
    });

    it("gives attachments a fresh signed URL and does not keep them", async () => {
        const { resolve, cache, fetchFile, signedUrl } = setup();
        expect(await resolve(fileReference(pdf))).toBe(`https://storage.test/${pdf}?token=x`);
        await resolve(fileReference(pdf));
        expect(signedUrl).toHaveBeenCalledTimes(2);
        expect(fetchFile).not.toHaveBeenCalled();
        expect(await cache.get(pdf)).toBeNull();
    });

    it("keeps nothing without a cache (public view)", async () => {
        const signedUrl = vi.fn(async (path: string) => `https://storage.test/${path}`);
        const resolve = createFileUrlResolver({ signedUrl });
        expect(await resolve(fileReference(image))).toBe(`https://storage.test/${image}`);
    });

    it("fails when the image cannot be loaded, so the editor shows an error", async () => {
        const resolve = createFileUrlResolver({
            signedUrl: async () => "https://storage.test/x",
            cache: new FileCache("user-2", new IDBFactory()),
            fetchFile: async () => new Response("nope", { status: 404 }),
        });
        await expect(resolve(fileReference(image))).rejects.toThrow("404");
    });
});

describe("FileCache", () => {
    it("deletes the files of pages that are no longer readable", async () => {
        const { cache } = setup();
        const other = `${OTHER_PAGE}/c0000000-0000-4000-8000-000000000005-x.png`;
        await cache.put(image, new Blob(["a"]));
        await cache.put(other, new Blob(["b"]));
        expect(await cache.deleteFilesExcept(new Set([PAGE]))).toBe(1);
        expect(await cache.get(image)).not.toBeNull();
        expect(await cache.get(other)).toBeNull();
    });
});
