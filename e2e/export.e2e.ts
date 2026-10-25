import type { Page } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { readFile } from "node:fs/promises";
import { createBackend, page as fakePage } from "./fake-supabase";
import { expect, openApp, test } from "./test";

const TRIP = "1a2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d";
const DAY = "2b3c4d5e-6f7a-4b9c-8d1e-2f3a4b5c6d7e";
const IMAGE = `${TRIP}/9f8e7d6c-5b4a-4321-8fed-cba987654321-kolosseum.png`;
const TRIP_FILE = "Reise nach Rom 1a2b3c4d5e6f4a8b9c0d1e2f3a4b5c6d";
const DAY_FILE = "Tag 1 2b3c4d5e6f7a4b9c8d1e2f3a4b5c6d7e";

// A 2×2 PNG in nodi-Indigo.
const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNkzPwPBkwMDP8ZGRgYAAAg8wLqIW2JjAAAAABJRU5ErkJggg==",
    "base64",
);

const text = (value: string, styles = {}) => ({ type: "text", text: value, styles });
const block = (type: string, content: unknown[], props = {}, children: unknown[] = []) => ({
    id: crypto.randomUUID(),
    type,
    props,
    content,
    children,
});

/** A real change event on the file input, as in notion-import.e2e.ts. */
async function chooseArchive(page: Page, archive: Uint8Array) {
    await page.evaluate(
        (bytes) => {
            const input = document.querySelector<HTMLInputElement>("dialog input[type=file]");
            if (!input) throw new Error("Kein Datei-Feld");
            const transfer = new DataTransfer();
            transfer.items.add(new File([new Uint8Array(bytes)], "export.zip", { type: "application/zip" }));
            input.files = transfer.files;
            input.dispatchEvent(new Event("change", { bubbles: true }));
        },
        [...archive],
    );
}

test("Eine Seite wird mit Unterseite und Bild als ZIP exportiert, und nodi liest den Export wieder ein", async ({
    page,
    context,
}) => {
    const backend = createBackend({
        pages: [fakePage(TRIP, "Reise nach Rom"), fakePage(DAY, "Tag 1", { parent_id: TRIP })],
        files: new Map([[IMAGE, PNG]]),
        savedDocuments: new Map<string, unknown>([
            [
                TRIP,
                [
                    block("heading", [text("Plan")], { level: 2 }),
                    block("paragraph", [text("Eine Woche mit "), text("vielen", { bold: true }), text(" Ausflügen.")]),
                    block("paragraph", [
                        text("Weiter: "),
                        { type: "pageLink", props: { pageId: DAY, title: "Tag 1" } },
                    ]),
                    block("image", [], { url: `nodi-file:${IMAGE}`, name: "kolosseum.png" }),
                    block("callout", [text("Tickets vorher kaufen")], { emoji: "🎟️", color: "blue" }),
                ],
            ],
            [DAY, [block("paragraph", [text("Ankunft am Abend.")])]],
        ]),
    });
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Reise nach Rom", exact: true }).click();
    await page.getByRole("button", { name: "Seitenmenü" }).click();
    await page.getByRole("menuitem", { name: "Exportieren" }).click();

    const dialog = page.getByRole("dialog", { name: "Exportieren" });
    await expect(dialog).toContainText("Seite „Reise nach Rom“");
    const downloading = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Exportieren" }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(/^Reise nach Rom \d{4}-\d{2}-\d{2}\.zip$/);
    await expect(dialog.getByRole("status")).toContainText("Fertig: 2 Seiten, 1 Datei.");

    // The ZIP: Notion's layout, Markdown from BlockNote.
    const archive = new Uint8Array(await readFile(await download.path()));
    const files = unzipSync(archive);
    expect(Object.keys(files).sort()).toEqual([
        `${TRIP_FILE}.md`,
        `${TRIP_FILE}/${DAY_FILE}.md`,
        `${TRIP_FILE}/kolosseum.png`,
    ]);
    expect(Buffer.from(files[`${TRIP_FILE}/kolosseum.png`])).toEqual(PNG);
    const markdown = strFromU8(files[`${TRIP_FILE}.md`]);
    expect(markdown).toMatch(/^# Reise nach Rom\n/);
    expect(markdown).toContain("## Plan");
    expect(markdown).toContain("Eine Woche mit **vielen** Ausflügen.");
    expect(markdown).toContain(`[Tag 1](${encodeURIComponent(TRIP_FILE)}/${encodeURIComponent(DAY_FILE)}.md)`);
    expect(markdown).toContain(`(${encodeURIComponent(TRIP_FILE)}/kolosseum.png)`);
    expect(markdown).toContain("<aside>\n🎟️ Tickets vorher kaufen\n</aside>");
    expect(strFromU8(files[`${TRIP_FILE}/${DAY_FILE}.md`])).toBe("# Tag 1\n\nAnkunft am Abend.\n");
    await dialog.getByRole("button", { name: "Schließen" }).click();

    // Round trip: the import builds the same pages again, with image, link and callout.
    await page.getByRole("button", { name: "Workspace und Konto" }).click();
    await page.getByRole("menuitem", { name: "Aus Notion importieren" }).click();
    const importDialog = page.getByRole("dialog", { name: "Aus Notion importieren" });
    await expect(importDialog.getByLabel("Notion-Export (ZIP)")).toBeVisible();
    await chooseArchive(page, archive);
    await importDialog.getByRole("button", { name: "Importieren" }).click();
    await expect(importDialog.getByText("2 von 2 Seiten importiert, 1 Datei übernommen.")).toBeVisible();

    const imported = backend.pages.filter((item) => item.title === "Reise nach Rom" && item.id !== TRIP);
    expect(imported).toHaveLength(1);
    const importedDay = backend.pages.find((item) => item.title === "Tag 1" && item.id !== DAY);
    expect(importedDay?.parent_id).toBe(imported[0].id);
    const document = JSON.stringify(backend.savedDocuments.get(imported[0].id));
    expect(document).toContain('"type":"callout"');
    expect(document).toContain(`"pageId":"${importedDay?.id}"`);
    expect(document).toMatch(new RegExp(`nodi-file:${imported[0].id}/[0-9a-f-]{36}-kolosseum\\.png`));
});

test("Der ganze Workspace wird exportiert", async ({ page, context }) => {
    const backend = createBackend({ pages: [fakePage(TRIP, "Reise nach Rom"), fakePage(DAY, "Tag 1")] });
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Workspace und Konto" }).click();
    await page.getByRole("menuitem", { name: "Workspace exportieren" }).click();

    const dialog = page.getByRole("dialog", { name: "Exportieren" });
    await expect(dialog).toContainText("Workspace „Team“");
    const downloading = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Exportieren" }).click();
    const files = unzipSync(new Uint8Array(await readFile(await (await downloading).path())));
    expect(Object.keys(files).sort()).toEqual([`${TRIP_FILE}.md`, `${DAY_FILE}.md`]);
});
