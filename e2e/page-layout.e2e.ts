import { createBackend, page as fakePage, taskDatabase } from "./fake-supabase";
import { expect, openApp, test } from "./test";

const NOTES = "b0000000-0000-4000-8000-000000000001";

// The page head like Notion (package 45a).
test("Titel, Überschriften und Titelbild haben Notions Maße", async ({ page, context }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const backend = createBackend({
        pages: [fakePage(NOTES, "Notizen", { icon: "📝", cover: "gradient:ocean" })],
    });
    backend.savedDocuments.set(NOTES, [
        {
            id: "h1",
            type: "heading",
            props: { level: 1 },
            content: [{ type: "text", text: "Ziele", styles: {} }],
            children: [],
        },
        {
            id: "h2",
            type: "heading",
            props: { level: 2 },
            content: [{ type: "text", text: "Aufgaben", styles: {} }],
            children: [],
        },
    ]);
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Notizen", exact: true }).click();

    await expect(page.getByRole("textbox", { name: "Seitentitel" })).toHaveCSS("font-size", "40px");
    await expect(page.getByRole("heading", { name: "Ziele", level: 1 })).toHaveCSS("font-size", "30px");
    await expect(page.getByRole("heading", { name: "Aufgaben", level: 2 })).toHaveCSS("font-size", "24px");

    // The cover spans the page from the top bar on; the icon reaches into it.
    const cover = await page.getByRole("img", { name: "Titelbild" }).boundingBox();
    const scroll = await page.locator(".nodi-page-scroll").boundingBox();
    const icon = await page.getByRole("button", { name: "Icon ändern" }).boundingBox();
    expect(cover && scroll && icon).toBeTruthy();
    if (!cover || !scroll || !icon) return;
    expect(cover.x).toBe(scroll.x);
    expect(cover.width).toBe(scroll.width);
    expect(cover.y).toBe(scroll.y);
    expect(icon.y).toBeLessThan(cover.y + cover.height);
    expect(icon.y + icon.height).toBeGreaterThan(cover.y + cover.height);

    // No comment button under the title until one is written.
    await expect(page.getByRole("region", { name: "Kommentare" })).toHaveCount(0);
    await page.getByRole("button", { name: "Kommentar hinzufügen" }).click();
    await expect(
        page.getByRole("region", { name: "Kommentare" }).getByLabel("Kommentar", { exact: true }),
    ).toBeFocused();
});

// Database pages like Notion (package 45b): the whole width, and the "Neu" row as wide as the table.
test("Eine Datenbank nutzt die ganze Breite; „Neu“ ist so breit wie die Tabelle", async ({ page, context }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const backend = taskDatabase({
        properties: ["Eins", "Zwei", "Drei", "Vier", "Fünf", "Sechs"].map((name, index) => ({
            id: `p${index}`,
            databaseId: "db",
            name,
            type: "text",
            options: {},
            position: index,
        })),
    });
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Aufgaben", exact: true }).click();
    await page.getByRole("table").waitFor();

    const scroll = await page.locator(".nodi-page-scroll").boundingBox();
    const title = await page.getByRole("textbox", { name: "Seitentitel" }).boundingBox();
    expect(scroll && title).toBeTruthy();
    if (!scroll || !title) return;
    expect(title.x - scroll.x).toBe(54);
    expect(title.width).toBe(scroll.width - 2 * 54);

    const table = await page.getByRole("table").boundingBox();
    const newRow = await page.getByRole("button", { name: "Neu", exact: true }).boundingBox();
    expect(table && newRow).toBeTruthy();
    if (!table || !newRow) return;
    expect(newRow.x).toBe(table.x);
    expect(newRow.width).toBe(table.width);
    await expect(page.getByRole("button", { name: "Seitenmenü" })).toBeVisible();
    await page.getByRole("button", { name: "Seitenmenü" }).click();
    await expect(page.getByRole("menuitem", { name: "Volle Breite" })).toHaveCount(0);
});
