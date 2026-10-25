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

test("Eine Datenbank wird als CSV mit ihren Einträgen exportiert und wieder importiert", async ({ page, context }) => {
    const TASKS = "3c4d5e6f-7a8b-4c0d-9e1f-3a4b5c6d7e8f";
    const TICKETS = "4d5e6f7a-8b9c-4d1e-8f2a-4b5c6d7e8f9a";
    const HOTEL = "5e6f7a8b-9c0d-4e2f-9a3b-5c6d7e8f9a0b";
    const TASKS_FILE = "Aufgaben 3c4d5e6f7a8b4c0d9e1f3a4b5c6d7e8f";
    const backend = createBackend({
        pages: [
            fakePage(TASKS, "Aufgaben", { kind: "database" }),
            fakePage(HOTEL, "Hotel", { parent_id: TASKS, position: 1 }),
            fakePage(TICKETS, "Tickets", { parent_id: TASKS, position: 0 }),
        ],
        views: [{ id: "v1", databaseId: TASKS, name: "Tabelle", type: "table", config: {}, position: 1 }],
        savedDocuments: new Map<string, unknown>([[TICKETS, [block("paragraph", [text("Online kaufen.")])]]]),
    });
    backend.properties.push(
        {
            id: "p-status",
            databaseId: TASKS,
            name: "Status",
            type: "status",
            position: 0,
            options: {
                options: [
                    { id: "o-open", name: "Offen", color: "gray" },
                    { id: "o-done", name: "Erledigt", color: "green" },
                ],
            },
        },
        { id: "p-paid", databaseId: TASKS, name: "Bezahlt", type: "checkbox", position: 1, options: {} },
        { id: "p-budget", databaseId: TASKS, name: "Budget", type: "number", position: 2, options: { format: "euro" } },
    );
    backend.values.push(
        { pageId: TICKETS, propertyId: "p-status", value: "o-open", updatedAt: "2026-10-19T08:00:00Z" },
        { pageId: TICKETS, propertyId: "p-paid", value: true, updatedAt: "2026-10-19T08:00:00Z" },
        { pageId: TICKETS, propertyId: "p-budget", value: 1200.5, updatedAt: "2026-10-19T08:00:00Z" },
        { pageId: HOTEL, propertyId: "p-status", value: "o-done", updatedAt: "2026-10-19T08:00:00Z" },
        { pageId: HOTEL, propertyId: "p-budget", value: 80, updatedAt: "2026-10-19T08:00:00Z" },
    );
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Aufgaben", exact: true }).click();
    await expect(page.getByRole("table")).toContainText("Tickets");
    await page.getByRole("button", { name: "Seitenmenü" }).click();
    await page.getByRole("menuitem", { name: "Exportieren" }).click();

    const dialog = page.getByRole("dialog", { name: "Exportieren" });
    const downloading = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Exportieren" }).click();
    const archive = new Uint8Array(await readFile(await (await downloading).path()));
    await expect(dialog.getByRole("status")).toContainText("Fertig: 2 Seiten, 1 Datenbank, 0 Dateien.");

    const files = unzipSync(archive);
    expect(Object.keys(files).sort()).toEqual([
        `${TASKS_FILE}.csv`,
        `${TASKS_FILE}/Hotel 5e6f7a8b9c0d4e2f9a3b5c6d7e8f9a0b.md`,
        `${TASKS_FILE}/Tickets 4d5e6f7a8b9c4d1e8f2a4b5c6d7e8f9a.md`,
    ]);
    // In the order of the database, not by title.
    expect(strFromU8(files[`${TASKS_FILE}.csv`])).toBe(
        "Name,Status,Bezahlt,Budget\nTickets,Offen,Yes,€1200.5\nHotel,Erledigt,No,€80\n",
    );
    await dialog.getByRole("button", { name: "Schließen" }).click();

    // Round trip: the import builds the database again, with types, values and the text of the entries.
    await page.getByRole("button", { name: "Workspace und Konto" }).click();
    await page.getByRole("menuitem", { name: "Aus Notion importieren" }).click();
    const importDialog = page.getByRole("dialog", { name: "Aus Notion importieren" });
    await expect(importDialog.getByLabel("Notion-Export (ZIP)")).toBeVisible();
    await chooseArchive(page, archive);
    await importDialog.getByRole("button", { name: "Importieren" }).click();
    await expect(importDialog.getByText(/1 von 1 Datenbank \(2 Einträge\) importiert/)).toBeVisible();

    const imported = backend.pages.find((item) => item.title === "Aufgaben" && item.id !== TASKS);
    expect(imported?.kind).toBe("database");
    const properties = backend.properties.filter((property) => property.databaseId === imported?.id);
    expect(properties.map(({ name, type }) => [name, type])).toEqual([
        ["Status", "status"],
        ["Bezahlt", "checkbox"],
        ["Budget", "number"],
    ]);
    expect(properties[2].options).toEqual({ format: "euro" });
    const entries = backend.pages.filter((item) => item.parent_id === imported?.id);
    expect(entries.map(({ title, position }) => [title, position])).toEqual([
        ["Tickets", 0],
        ["Hotel", 1],
    ]);
    const budgets = backend.propertyCalls.filter((call) => call.p_property_id === properties[2].id);
    expect(budgets.map((call) => call.p_value).sort()).toEqual([1200.5, 80]);
    expect(JSON.stringify(backend.savedDocuments.get(entries[0].id))).toContain("Online kaufen.");
});
