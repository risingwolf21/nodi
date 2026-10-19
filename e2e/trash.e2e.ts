import { createBackend, page as fakePage } from "./fake-supabase";
import { expect, openApp, test } from "./test";

test("Ein großer Seitenbaum (z. B. ein Notion-Import) geht in den Papierkorb und zurück", async ({ page, context }) => {
    // 400 subpages: their ids do not fit into one request URL.
    const children = Array.from({ length: 400 }, (_, index) =>
        fakePage(`c0000000-0000-4000-8000-${String(index).padStart(12, "0")}`, `Seite ${index}`, {
            parent_id: "b0000000-0000-4000-8000-000000000001",
        }),
    );
    const backend = createBackend({
        pages: [fakePage("b0000000-0000-4000-8000-000000000001", "Notion-Import"), ...children],
    });
    await openApp(page, context, backend);

    await page.getByRole("button", { name: "Aktionen für Notion-Import" }).click();
    await page.getByRole("menuitem", { name: "In den Papierkorb" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "In Papierkorb verschieben" }).click();
    await expect.poll(() => backend.pages.filter((item) => item.is_archived).length).toBe(401);
    await expect(page.getByRole("button", { name: "Notion-Import", exact: true })).toBeHidden();

    await page.getByRole("button", { name: "Papierkorb" }).click();
    await page.getByRole("button", { name: "„Notion-Import“ wiederherstellen" }).click();
    await expect.poll(() => backend.pages.filter((item) => item.is_archived).length).toBe(0);
});
