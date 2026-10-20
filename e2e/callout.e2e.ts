import { createBackend, page as fakePage } from "./fake-supabase";
import { expect, openApp, test } from "./test";

const NOTES = "b0000000-0000-4000-8000-000000000001";

test("„/Callout“ fügt einen Hinweis mit Emoji und Farbe ein", async ({ page, context }) => {
    const backend = createBackend({ pages: [fakePage(NOTES, "Notizen")] });
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Notizen", exact: true }).click();

    await page.locator(".bn-editor").first().click();
    await page.keyboard.type("/Callout");
    await expect(page.getByRole("option", { name: /Callout/ }).first()).toBeVisible();
    await page.keyboard.press("Enter");
    await page.keyboard.type("Früh anfangen");

    const editor = page.locator(".bn-editor");
    const callout = editor.locator('[data-content-type="callout"]');
    await expect(callout).toContainText("Früh anfangen");
    await expect
        .poll(() => JSON.stringify(backend.savedDocuments.get(NOTES) ?? null))
        .toMatch(/"type":"callout".*"text":"Früh anfangen"/);

    // Icon and background from the menu at the emoji.
    await callout.getByRole("button", { name: "Callout-Icon und Farbe ändern" }).click();
    await page.getByRole("menuitem", { name: "Icon 🚀" }).click();
    await callout.getByRole("button", { name: "Callout-Icon und Farbe ändern" }).click();
    await page.getByRole("menuitemradio", { name: "Blau" }).click();
    await expect(callout).toContainText("🚀");
    await expect(callout).toHaveAttribute("data-color", "blue");
    await expect
        .poll(() => JSON.stringify(backend.savedDocuments.get(NOTES) ?? null))
        .toMatch(/"type":"callout","props":\{[^}]*"emoji":"🚀"[^}]*"color":"blue"/);
});
