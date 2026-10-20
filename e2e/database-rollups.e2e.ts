import { createBackend, page as fakePage } from "./fake-supabase";
import { expect, openApp, test } from "./test";

test("Ein Rollup summiert eine Eigenschaft der verknüpften Einträge", async ({ page, context }) => {
    const backend = createBackend({
        pages: [
            fakePage("db1", "Projekte", { kind: "database" }),
            fakePage("p1", "Website", { parent_id: "db1", position: 1 }),
            fakePage("p2", "Umzug", { parent_id: "db1", position: 2 }),
            fakePage("db2", "Aufgaben", { kind: "database" }),
            fakePage("t1", "Entwurf", { parent_id: "db2", position: 1 }),
            fakePage("t2", "Texte", { parent_id: "db2", position: 2 }),
        ],
        properties: [
            {
                id: "tasks",
                databaseId: "db1",
                name: "Aufgaben",
                type: "relation",
                options: { databaseId: "db2", pairedPropertyId: "projects" },
                position: 1,
            },
            {
                id: "projects",
                databaseId: "db2",
                name: "Projekte",
                type: "relation",
                options: { databaseId: "db1", pairedPropertyId: "tasks" },
                position: 1,
            },
            { id: "hours", databaseId: "db2", name: "Stunden", type: "number", options: {}, position: 2 },
        ],
        values: [
            { pageId: "p1", propertyId: "tasks", value: ["t1", "t2"], updatedAt: "2026-10-01T10:00:00Z" },
            { pageId: "t1", propertyId: "hours", value: 2, updatedAt: "2026-10-01T10:00:00Z" },
            { pageId: "t2", propertyId: "hours", value: 3.5, updatedAt: "2026-10-01T10:00:00Z" },
        ],
        views: [{ id: "v1", databaseId: "db1", name: "Tabelle", type: "table", config: {}, position: 1 }],
    });
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Projekte", exact: true }).click();
    const table = page.getByRole("table");

    // A new rollup asks what it reads.
    await table.getByRole("button", { name: "Eigenschaft hinzufügen" }).click();
    await page.getByRole("menuitem", { name: "Rollup" }).click();
    const editor = page.getByRole("dialog", { name: "Rollup „Rollup“" });
    await expect(editor.getByLabel("Verknüpfung")).toHaveValue("tasks");
    await editor.getByLabel("Eigenschaft").selectOption({ label: "Stunden (Zahl)" });
    await editor.getByLabel("Berechnung").selectOption({ label: "Summe" });
    await editor.getByRole("button", { name: "Speichern" }).click();
    await expect(editor).toBeHidden();
    expect(backend.propertyPatches.at(-1)).toEqual({
        options: { relationPropertyId: "tasks", targetPropertyId: "hours", function: "sum" },
    });

    // The sum of the linked entries; without links it is 0.
    await expect(table.getByRole("row", { name: /Website/ })).toContainText("5,5");
    await expect(table.getByRole("row", { name: /Umzug/ })).toContainText("0");
});
