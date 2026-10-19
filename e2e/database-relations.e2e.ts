import { createBackend, page as fakePage } from "./fake-supabase";
import { expect, openApp, test } from "./test";

test("Zwei Datenbanken werden verknüpft; die Gegenseite zeigt die Verknüpfung", async ({ page, context }) => {
    const backend = createBackend({
        pages: [
            fakePage("db1", "Projekte", { kind: "database" }),
            fakePage("p1", "Website", { parent_id: "db1", position: 1 }),
            fakePage("db2", "Aufgaben", { kind: "database" }),
            fakePage("t1", "Entwurf", { parent_id: "db2", position: 1 }),
            fakePage("t2", "Texte", { parent_id: "db2", position: 2 }),
        ],
        views: [
            { id: "v1", databaseId: "db1", name: "Tabelle", type: "table", config: {}, position: 1 },
            { id: "v2", databaseId: "db2", name: "Tabelle", type: "table", config: {}, position: 1 },
        ],
    });
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Projekte", exact: true }).click();
    const table = page.getByRole("table");

    // A relation is created with its target; the server adds the other side.
    await table.getByRole("button", { name: "Eigenschaft hinzufügen" }).click();
    await page.getByRole("menuitem", { name: "Verknüpfung" }).click();
    await page.getByRole("menuitem", { name: "Aufgaben" }).click();
    await expect(table.getByRole("button", { name: "Aufgaben", exact: true })).toBeVisible();
    expect(backend.properties.map(({ databaseId, name, type }) => [databaseId, name, type])).toEqual([
        ["db1", "Aufgaben", "relation"],
        ["db2", "Projekte", "relation"],
    ]);

    // Link an entry of the other database.
    await table.getByRole("button", { name: "Aufgaben wählen" }).click();
    const picker = page.getByRole("dialog", { name: "Aufgaben" });
    await picker.getByRole("button", { name: "Entwurf" }).click();
    await expect.poll(() => backend.propertyCalls.at(-1)?.p_value).toEqual(["t1"]);
    await page.keyboard.press("Escape");
    await expect(table.getByRole("button", { name: "Aufgaben wählen" })).toContainText("Entwurf");

    // The other database shows the link back.
    await page.getByRole("button", { name: "Aufgaben", exact: true }).first().click();
    const otherTable = page.getByRole("table");
    await expect(otherTable.getByRole("button", { name: "Projekte", exact: true })).toBeVisible();
    await expect(otherTable.getByRole("row", { name: /Entwurf/ })).toContainText("Website");
});
