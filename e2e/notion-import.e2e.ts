import type { Page } from "@playwright/test";
import { strToU8, zipSync } from "fflate";
import { createBackend } from "./fake-supabase";
import { expect, openApp, test } from "./test";

const ROME = "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d";
const DAY = "2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e";
const TASKS = "3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f";

// A 2×2 PNG in nodi-Indigo.
const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNkzPwPBkwMDP8ZGRgYAAAg8wLqIW2JjAAAAABJRU5ErkJggg==",
    "base64",
);

/** A Notion export ("Markdown & CSV"), as Notion nests it: one part inside the download. */
function notionExport(): Uint8Array {
    const part = zipSync({
        [`Reise nach Rom ${ROME}.md`]: strToU8(
            [
                "# Reise nach Rom",
                "",
                "Eine Woche mit **vielen** Ausflügen. Mehr auf [Wikipedia](https://de.wikipedia.org/wiki/Rom).",
                "",
                `![Kolosseum](Reise%20nach%20Rom%20${ROME}/Kolosseum.png)`,
                "",
                `[Plan.pdf](Reise%20nach%20Rom%20${ROME}/Plan.pdf)`,
                "",
                `[Tag 1](Reise%20nach%20Rom%20${ROME}/Tag%201%20${DAY}.md)`,
                "",
                `[Aufgaben](Aufgaben%20${TASKS}.csv)`,
            ].join("\n"),
        ),
        [`Reise nach Rom ${ROME}/Kolosseum.png`]: PNG,
        [`Reise nach Rom ${ROME}/Plan.pdf`]: strToU8("%PDF-1.4"),
        [`Reise nach Rom ${ROME}/Tag 1 ${DAY}.md`]: strToU8("# Tag 1\n\nAnkunft am Abend."),
        [`Aufgaben ${TASKS}.csv`]: strToU8("Name,Status\nTickets,Erledigt"),
    });
    return zipSync({ "Export-Part-1.zip": part });
}

async function openImportDialog(page: Page) {
    await page.getByRole("button", { name: "Workspace und Konto" }).click();
    await page.getByRole("menuitem", { name: "Aus Notion importieren" }).click();
    const dialog = page.getByRole("dialog", { name: "Aus Notion importieren" });
    // The dialog is loaded on demand.
    await expect(dialog.getByLabel("Notion-Export (ZIP)")).toBeVisible();
    return dialog;
}

/** A real change event on the file input (setInputFiles does not reach it with every Chromium build). */
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

test("Ein Notion-Export wird mit Unterseiten und Dateien unter „Notion-Import“ angelegt", async ({ page, context }) => {
    const backend = createBackend();
    await openApp(page, context, backend);
    const dialog = await openImportDialog(page);

    await chooseArchive(page, notionExport());
    await dialog.getByRole("button", { name: "Importieren" }).click();

    await expect(dialog.getByText("2 von 2 Seiten importiert, 2 Dateien übernommen.")).toBeVisible();
    await expect(dialog.getByText("Noch nicht übernommen (1 Datenbank): Aufgaben.")).toBeVisible();

    // The tree: everything below a new private page.
    const byTitle = (title: string) => backend.pages.find((item) => item.title === title);
    const root = byTitle("Notion-Import");
    const rome = byTitle("Reise nach Rom");
    expect(root).toMatchObject({ parent_id: null, visibility: "private" });
    expect(rome?.parent_id).toBe(root?.id);
    expect(byTitle("Tag 1")?.parent_id).toBe(rome?.id);

    // Files went into the page's folder; the text references them.
    const paths = [...backend.files.keys()]; // in the order of the text
    expect(paths).toEqual([
        expect.stringMatching(new RegExp(`^${rome?.id}/[0-9a-f-]{36}-Kolosseum\\.png$`)),
        expect.stringMatching(new RegExp(`^${rome?.id}/[0-9a-f-]{36}-Plan\\.pdf$`)),
    ]);
    const document = JSON.stringify(backend.savedDocuments.get(rome?.id ?? ""));
    expect(document).toContain("https://de.wikipedia.org/wiki/Rom");
    expect(document).not.toContain(".md");
    for (const path of paths) expect(document).toContain(`nodi-file:${path}`);

    // The imported page opens in the editor, with its image.
    await dialog.getByRole("button", { name: "Öffnen" }).click();
    await page.getByRole("button", { name: "Reise nach Rom", exact: true }).click();
    const image = page.locator(".bn-editor img").first();
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(2);
    await expect(page.locator(".bn-editor").first()).toContainText("Plan.pdf");
    await expect(page.locator(".bn-editor").first()).toContainText("Tag 1");
});

test("Eine Datei ohne Notion-Seiten wird mit Hinweis abgelehnt", async ({ page, context }) => {
    const backend = createBackend();
    await openApp(page, context, backend);
    const dialog = await openImportDialog(page);

    await chooseArchive(page, zipSync({ "foto.png": PNG }));
    await dialog.getByRole("button", { name: "Importieren" }).click();

    await expect(dialog.getByRole("alert")).toContainText("Markdown & CSV");
    expect(backend.pagesCreated).toBe(0);
});
