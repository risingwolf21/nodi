import type { Page } from "@playwright/test";
import { createBackend, page as fakePage } from "./fake-supabase";
import { expect, openApp, test } from "./test";

// A 2×2 PNG in nodi-Indigo.
const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNkzPwPBkwMDP8ZGRgYAAAg8wLqIW2JjAAAAABJRU5ErkJggg==",
    "base64",
);

/**
 * Chooses a file in BlockNote's upload panel. A real change event on the
 * file input (setInputFiles does not reach it with every Chromium build).
 */
async function chooseFile(page: Page, name: string, content: Buffer | { size: number }) {
    await page.locator("input[type=file]").first().waitFor({ state: "attached" });
    // Large files are made in the page; sending megabytes as JSON is slow.
    const bytes = Buffer.isBuffer(content) ? [...content] : null;
    const size = Buffer.isBuffer(content) ? 0 : content.size;
    await page.evaluate(
        ({ name, bytes, size }) => {
            const input = document.querySelector<HTMLInputElement>("input[type=file]");
            if (!input) throw new Error("Kein Datei-Feld");
            const data = bytes ? new Uint8Array(bytes) : new Uint8Array(size);
            const transfer = new DataTransfer();
            transfer.items.add(new File([data], name, { type: "image/png" }));
            input.files = transfer.files;
            input.dispatchEvent(new Event("change", { bubbles: true }));
        },
        { name, bytes, size },
    );
}

/** Width and height from the frame header (SOF) of a JPEG. */
function jpegSize(bytes: Buffer): [number, number] | null {
    let offset = 2;
    while (offset + 9 < bytes.length && bytes[offset] === 0xff) {
        const marker = bytes[offset + 1];
        if (marker >= 0xc0 && marker <= 0xc3) return [bytes.readUInt16BE(offset + 7), bytes.readUInt16BE(offset + 5)];
        offset += 2 + bytes.readUInt16BE(offset + 2);
    }
    return null;
}

async function insertImageBlock(page: Page) {
    await page.locator(".bn-editor").first().click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("/Bild");
    await expect(page.getByRole("option", { name: /Bild/ }).first()).toBeVisible();
    await page.keyboard.press("Enter");
}

test("Bilder werden hochgeladen, als Verweis gespeichert und bleiben ohne Storage sichtbar", async ({
    page,
    context,
}) => {
    const backend = createBackend({ pages: [fakePage("b0000000-0000-4000-8000-000000000001", "Fotos")] });
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Fotos", exact: true }).click();

    await insertImageBlock(page);
    await chooseFile(page, "Strand Größe.png", PNG);
    const image = page.locator(".bn-editor img").first();
    await expect(image).toHaveAttribute("src", /^blob:/);
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(2);

    // Stored in the page's folder, with a name Storage accepts.
    const paths = [...backend.files.keys()];
    expect(paths).toEqual([
        expect.stringMatching(/^b0000000-0000-4000-8000-000000000001\/[0-9a-f-]{36}-Strand-Grosse\.png$/),
    ]);
    expect(backend.files.get(paths[0])?.equals(PNG)).toBe(true);
    // The document keeps a reference, not an expiring URL.
    await expect
        .poll(() => JSON.stringify(backend.savedDocuments.get("b0000000-0000-4000-8000-000000000001") ?? null))
        .toContain(`"url":"nodi-file:${paths[0]}"`);

    // Without Storage (e.g. offline) the image comes from the device.
    await context.route("**/storage/v1/**", (route) => route.abort("internetdisconnected"));
    await page.reload();
    await page.getByRole("button", { name: "Fotos", exact: true }).click();
    const cached = page.locator(".bn-editor img").first();
    await expect(cached).toHaveAttribute("src", /^blob:/);
    await expect.poll(() => cached.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(2);
});

test("Dateien über 10 MB werden mit Hinweis abgelehnt", async ({ page, context }) => {
    const backend = createBackend({ pages: [fakePage("b0000000-0000-4000-8000-000000000001", "Fotos")] });
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Fotos", exact: true }).click();

    await insertImageBlock(page);
    await chooseFile(page, "riesig.png", { size: 10 * 1024 * 1024 + 1 });
    await expect(
        page.getByText("Hochladen fehlgeschlagen. Dateien brauchen Internet und höchstens 10 MB."),
    ).toBeVisible();
    expect(backend.files.size).toBe(0);
});

test("Die öffentliche Ansicht zeigt Bilder der Seite und speichert nichts", async ({ page, context }) => {
    const path = "b0000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000002-foto.png";
    const backend = createBackend({
        files: new Map([[path, PNG]]),
        publicPages: new Map([
            [
                "d0000000-0000-4000-8000-000000000003",
                {
                    title: "Reise",
                    icon: null,
                    full_width: false,
                    document: [{ id: "bild", type: "image", props: { url: `nodi-file:${path}`, name: "foto.png" } }],
                },
            ],
        ]),
    });
    await openApp(page, context, backend, { signedIn: false });
    await page.goto("./?p=d0000000-0000-4000-8000-000000000003");

    const image = page.locator(".bn-editor img").first();
    await expect(image).toHaveAttribute("src", /\/storage\/v1\/object\/sign\/page-files\//);
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(2);
    expect(await page.evaluate(() => indexedDB.databases())).toEqual([]);
});

test("Große Fotos werden vor dem Hochladen verkleinert, der Fortschritt ist zu sehen", async ({ page, context }) => {
    const backend = createBackend({ pages: [fakePage("b0000000-0000-4000-8000-000000000001", "Fotos")] });
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Fotos", exact: true }).click();

    // The upload waits until the notice has been seen.
    let release = () => {};
    const released = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/storage/v1/object/page-files/**", async (route) => {
        await released;
        await route.fallback();
    });

    await insertImageBlock(page);
    await page.locator("input[type=file]").first().waitFor({ state: "attached" });
    // A 4000×3000 photo made in the page (noise, so it is heavy like a real one).
    await page.evaluate(async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 4000;
        canvas.height = 3000;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Kein Canvas");
        const pixels = context.createImageData(4000, 3000);
        for (let index = 0; index < pixels.data.length; index += 1) {
            pixels.data[index] = index % 4 === 3 ? 255 : Math.floor(Math.random() * 256);
        }
        context.putImageData(pixels, 0, 0);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
        if (!blob) throw new Error("Kein Bild");
        const input = document.querySelector<HTMLInputElement>("input[type=file]");
        if (!input) throw new Error("Kein Datei-Feld");
        const transfer = new DataTransfer();
        transfer.items.add(new File([blob], "IMG_0001.jpeg", { type: "image/jpeg" }));
        input.files = transfer.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const notice = page.getByRole("status", { name: "Hochladen" });
    await expect(notice).toContainText("„IMG_0001.jpg“ wird hochgeladen");
    release();
    await expect(notice).toHaveCount(0);

    // Stored as a JPEG of at most 2560 px.
    await expect.poll(() => backend.files.size).toBe(1);
    const [[path, stored]] = [...backend.files];
    expect(path).toMatch(/-IMG_0001\.jpg$/);
    const size = jpegSize(stored);
    expect(size).toEqual([2560, 1920]);
});
