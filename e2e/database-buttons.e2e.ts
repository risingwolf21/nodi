import { createBackend, page as fakePage } from "./fake-supabase";
import { expect, openApp, test } from "./test";

test("Ein Button setzt Werte im Eintrag, in der Tabelle und im Eintrag selbst", async ({ page, context }) => {
    const backend = createBackend({
        pages: [
            fakePage("db", "Aufgaben", { kind: "database" }),
            fakePage("e1", "Gießen", { parent_id: "db", position: 1 }),
        ],
        properties: [
            { id: "done", databaseId: "db", name: "Fertig", type: "checkbox", options: {}, position: 1 },
            { id: "day", databaseId: "db", name: "Erledigt am", type: "date", options: {}, position: 2 },
        ],
        views: [{ id: "v1", databaseId: "db", name: "Tabelle", type: "table", config: {}, position: 1 }],
    });
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Aufgaben", exact: true }).click();
    const table = page.getByRole("table");

    // A new button asks what it does.
    await table.getByRole("button", { name: "Eigenschaft hinzufügen" }).click();
    await page.getByRole("menuitem", { name: "Button" }).click();
    const editor = page.getByRole("dialog", { name: "Button „Button“" });
    await editor.getByLabel("Beschriftung").fill("Abschließen");
    await editor.getByRole("button", { name: "Aktion hinzufügen" }).click();
    await expect(editor.getByLabel("Eigenschaft der Aktion 1")).toHaveValue("done");
    await expect(editor.getByLabel("Wert der Aktion 1")).toHaveValue("true");
    await editor.getByRole("button", { name: "Aktion hinzufügen" }).click();
    await expect(editor.getByLabel("Eigenschaft der Aktion 2")).toHaveValue("day");
    await expect(editor.getByLabel("Wert der Aktion 2")).toHaveValue("today");
    await editor.getByRole("button", { name: "Speichern" }).click();
    await expect(editor).toBeHidden();
    expect(backend.propertyPatches.at(-1)).toEqual({
        options: {
            label: "Abschließen",
            actions: [
                { propertyId: "done", value: true },
                { propertyId: "day", today: true },
            ],
        },
    });

    // A click sets both values of the entry.
    await table
        .getByRole("row", { name: /Gießen/ })
        .getByRole("button", { name: "Abschließen" })
        .click();
    await expect.poll(() => backend.propertyCalls.length).toBe(2);
    expect(backend.propertyCalls[0]).toMatchObject({ p_page_id: "e1", p_property_id: "done", p_value: true });
    expect(backend.propertyCalls[1]).toMatchObject({ p_page_id: "e1", p_property_id: "day" });
    expect(backend.propertyCalls[1].p_value).toEqual({
        start: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as unknown,
        end: null,
    });
    await expect(table.getByRole("row", { name: /Gießen/ }).getByRole("checkbox")).toBeChecked();

    // The same button in the entry's properties.
    await page.getByRole("button", { name: "Gießen öffnen" }).click();
    const bar = page.getByRole("region", { name: "Eigenschaften" });
    await bar.getByRole("button", { name: "Abschließen" }).click();
    await expect.poll(() => backend.propertyCalls.length).toBe(4);
    await expect(bar.getByRole("button", { name: "Button „Button“ bearbeiten" })).toBeVisible();
});
