import { createBackend, page as fakePage } from "./fake-supabase";
import { expect, openApp, test } from "./test";

const NOTES = "b0000000-0000-4000-8000-000000000001";

test("Seiten-Icon: Emoji suchen oder ein eigenes einfügen", async ({ page, context }) => {
    const backend = createBackend({ pages: [fakePage(NOTES, "Notizen")] });
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Notizen", exact: true }).click();

    await page.getByRole("button", { name: "Icon hinzufügen" }).click();
    await page.getByLabel("Emoji suchen").fill("rakete");
    await expect(page.getByRole("group", { name: "Icons" }).getByRole("menuitem")).toHaveCount(1);
    await page.getByRole("menuitem", { name: "Icon 🚀" }).click();
    await expect(page.getByRole("button", { name: "Icon ändern" })).toHaveText("🚀");
    await expect.poll(() => backend.pages.find((item) => item.id === NOTES)?.icon).toBe("🚀");

    // An emoji that is not in the list: typed or pasted into the search, Enter takes it.
    await page.getByRole("button", { name: "Icon ändern" }).click();
    await page.getByLabel("Emoji suchen").fill("🦄");
    await page.getByLabel("Emoji suchen").press("Enter");
    await expect.poll(() => backend.pages.find((item) => item.id === NOTES)?.icon).toBe("🦄");
});
