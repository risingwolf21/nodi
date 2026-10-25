import { createBackend, page as fakePage } from "./fake-supabase";
import { expect, openApp, test } from "./test";

const NOTES = "b0000000-0000-4000-8000-000000000001";
const TRIP = "b0000000-0000-4000-8000-000000000002";

test("„@“ verlinkt eine Seite; Klick öffnet sie, dort steht „Verlinkt von“", async ({ page, context }) => {
    const backend = createBackend({ pages: [fakePage(NOTES, "Notizen"), fakePage(TRIP, "Reiseplanung")] });
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Notizen", exact: true }).click();

    await page.locator(".bn-editor").first().click();
    await page.keyboard.type("Siehe @reise");
    await expect(page.getByRole("option", { name: /Reiseplanung/ })).toBeVisible();
    await page.keyboard.press("Enter");

    const editor = page.locator(".bn-editor");
    const link = editor.getByRole("button", { name: "Reiseplanung" });
    await expect(link).toBeVisible();
    await expect
        .poll(() => JSON.stringify(backend.savedDocuments.get(NOTES) ?? null))
        .toContain(`"type":"pageLink","props":{"pageId":"${TRIP}","title":"Reiseplanung"}`);

    // A renamed page shows its new title in the link.
    backend.pages.find((item) => item.id === TRIP)!.title = "Reise nach Rom";
    await page.reload();
    await page.getByRole("button", { name: "Notizen", exact: true }).click();
    await editor.getByRole("button", { name: "Reise nach Rom" }).click();
    await expect(page.getByRole("navigation", { name: "Pfad" })).toHaveText("Reise nach Rom");

    // The linked page lists the page that links it.
    const backlinks = page.getByRole("navigation", { name: "Verlinkt von" });
    await backlinks.getByRole("button", { name: "Notizen" }).click();
    await expect(editor).toContainText("Siehe");
});
