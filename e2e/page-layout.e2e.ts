import { createBackend, page as fakePage } from "./fake-supabase";
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
