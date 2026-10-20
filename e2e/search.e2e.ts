import { createBackend, page as fakePage } from "./fake-supabase";
import { expect, openApp, test } from "./test";

const NOTES = "b0000000-0000-4000-8000-000000000001";

const paragraph = (value: string) => ({
    type: "paragraph",
    props: {},
    content: [{ type: "text", text: value, styles: {} }],
    children: [],
});

test("Suche: Strg+K, Titel und Texte online; offline Titel und gespeicherte Seiten", async ({ page, context }) => {
    const backend = createBackend({
        pages: [fakePage("r1", "Reiseplanung"), fakePage(NOTES, "Notizen"), fakePage("x1", "Einkauf")],
        savedDocuments: new Map([[NOTES, [paragraph("Hotel in Rom buchen")]]]),
    });
    await openApp(page, context, backend);

    // Online: the server finds the text; Enter opens the page.
    await page.keyboard.press("Control+k");
    const dialog = page.getByRole("dialog", { name: "Suchen" });
    await dialog.getByLabel("Suchen").fill("rom");
    await expect(dialog.getByRole("button", { name: /Notizen/ })).toContainText("Hotel in Rom buchen");
    await dialog.getByLabel("Suchen").press("Enter");
    await expect(dialog).toBeHidden();
    await expect(page.locator(".bn-editor")).toContainText("Hotel in Rom buchen");

    // Offline: the page opened before is stored on the device and found by its text.
    backend.offline = true;
    await page.getByRole("button", { name: "Suchen" }).click();
    await dialog.getByLabel("Suchen").fill("hotel");
    await expect(dialog).toContainText("Offline: gesucht in Titeln");
    await expect(dialog.getByRole("button", { name: /Notizen/ })).toBeVisible();
    await dialog.getByLabel("Suchen").fill("reise");
    await expect(dialog.getByRole("button", { name: /Reiseplanung/ })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /Einkauf/ })).toHaveCount(0);
});
