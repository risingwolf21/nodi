import { createBackend, page as fakePage } from "./fake-supabase";
import { expect, openApp, test } from "./test";

const NOTES = "b0000000-0000-4000-8000-000000000001";

test("„/2 Spalten“ stellt Blöcke nebeneinander; auf dem Handy untereinander", async ({ page, context }) => {
    const backend = createBackend({ pages: [fakePage(NOTES, "Notizen")] });
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Notizen", exact: true }).click();

    await page.locator(".bn-editor").first().click();
    await page.keyboard.type("/2 Spalten");
    await expect(page.getByRole("option", { name: /2 Spalten/ })).toBeVisible();
    await page.keyboard.press("Enter");
    await page.keyboard.type("Links");

    const editor = page.locator(".bn-editor");
    const left = editor.getByText("Links");
    const columns = editor.locator('[data-content-type="column"]');
    await expect(columns).toHaveCount(2);
    // Into the second column.
    await columns.nth(1).locator("xpath=ancestor::*[contains(@class,'bn-block')][1]").locator("p").click();
    await page.keyboard.type("Rechts");
    const right = editor.getByText("Rechts");

    // Side by side: the same height, the right one further right.
    const [leftBox, rightBox] = [await left.boundingBox(), await right.boundingBox()];
    expect(Math.abs((leftBox?.y ?? 0) - (rightBox?.y ?? 100))).toBeLessThan(4);
    expect((rightBox?.x ?? 0) - (leftBox?.x ?? 0)).toBeGreaterThan(200);

    // Stored as plain blocks: columns > column > paragraph.
    await expect
        .poll(() => JSON.stringify(backend.savedDocuments.get(NOTES) ?? null))
        .toMatch(/"type":"columns".*"type":"column".*"text":"Links".*"type":"column".*"text":"Rechts"/);

    // Narrow screens stack the columns.
    await page.setViewportSize({ width: 390, height: 800 });
    const [narrowLeft, narrowRight] = [await left.boundingBox(), await right.boundingBox()];
    expect((narrowRight?.y ?? 0) - (narrowLeft?.y ?? 0)).toBeGreaterThan(10);
});
