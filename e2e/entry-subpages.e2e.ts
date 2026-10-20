import { createBackend, page as fakePage } from "./fake-supabase";
import { expect, openApp, test } from "./test";

test("Ein Datenbank-Eintrag hat Unterseiten; sie stehen im Eintrag, nicht in der Seitenleiste", async ({
    page,
    context,
}) => {
    const backend = createBackend({
        pages: [
            fakePage("db", "Aufgaben", { kind: "database" }),
            fakePage("e1", "Bericht", { parent_id: "db", position: 1 }),
            fakePage("s1", "Entwurf", { parent_id: "e1" }),
        ],
        views: [{ id: "v1", databaseId: "db", name: "Tabelle", type: "table", config: {}, position: 1 }],
    });
    await openApp(page, context, backend);
    const sidebar = page.locator("aside").first();
    await expect(sidebar.getByRole("button", { name: "Aufgaben", exact: true })).toBeVisible();
    await expect(sidebar).not.toContainText("Entwurf");

    await sidebar.getByRole("button", { name: "Aufgaben", exact: true }).click();
    await page.getByRole("button", { name: "Bericht öffnen" }).click();
    const subpages = page.getByRole("region", { name: "Unterseiten" });
    await expect(subpages.getByRole("button", { name: "Entwurf" })).toBeVisible();

    // A new subpage of the entry opens at once; the path leads back.
    await subpages.getByRole("button", { name: "Unterseite" }).click();
    await expect.poll(() => backend.pages.filter((item) => item.parent_id === "e1").length).toBe(2);
    const created = backend.pages.find((item) => item.parent_id === "e1" && item.id !== "s1");
    expect(created).toMatchObject({ kind: "page", position: null });
    await expect(page.getByRole("textbox", { name: "Seitentitel" })).toBeFocused();
    await expect(sidebar).not.toContainText("Unbenannte Seite");
    await page
        .getByRole("button", { name: /Bericht/ })
        .first()
        .click();
    await expect(subpages.getByRole("button")).toHaveCount(4);
});
