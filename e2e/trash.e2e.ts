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

test("„Papierkorb leeren“ löscht alle eigenen Seiten im Papierkorb auf einmal, Seiten anderer bleiben", async ({
    page,
    context,
}) => {
    const backend = createBackend({
        pages: [
            fakePage("p1", "Alt", { is_archived: true }),
            fakePage("p2", "Unterseite", { parent_id: "p1", is_archived: true }),
            fakePage("p3", "Entwurf", { is_archived: true }),
            fakePage("p4", "Von Anna", { is_archived: true, owner_id: "anna", visibility: "workspace" }),
            fakePage("p5", "Notizen"),
        ],
    });
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Papierkorb" }).click();
    await page.getByRole("button", { name: "Papierkorb leeren" }).click();

    const dialog = page.getByRole("alertdialog", { name: "Papierkorb leeren?" });
    await expect(dialog).toContainText("3 Seiten werden dauerhaft gelöscht");
    await expect(dialog).toContainText("1 Seite gehört anderen und bleibt im Papierkorb");
    await dialog.getByRole("button", { name: "Endgültig löschen" }).click();
    await expect(dialog).toBeHidden();

    expect(backend.pages.map((item) => item.id)).toEqual(["p4", "p5"]);
    // The server removes the files of the deleted pages (package 35).
    await expect.poll(() => backend.fileCleanups).toBe(1);
    await expect(page.getByText("Von Anna")).toBeVisible();
    await expect(page.getByText("Entwurf")).toBeHidden();
    // Only pages of others are left: nothing more to empty.
    await expect(page.getByRole("button", { name: "Papierkorb leeren" })).toBeHidden();
});
