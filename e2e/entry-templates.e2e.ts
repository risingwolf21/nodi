import { createBackend, page as fakePage } from "./fake-supabase";
import { expect, openApp, test } from "./test";

test("Vorlagen: anlegen, bearbeiten und daraus neue Einträge machen; die Ansichten zeigen sie nicht", async ({
    page,
    context,
}) => {
    const backend = createBackend({
        pages: [
            fakePage("db", "Besprechungen", { kind: "database" }),
            fakePage("e1", "Kickoff", { parent_id: "db", position: 1 }),
            fakePage("tpl", "Wochentreffen", { parent_id: "db", position: 2, is_template: true, icon: "📅" }),
        ],
        properties: [{ id: "place", databaseId: "db", name: "Ort", type: "text", options: {}, position: 1 }],
        values: [{ pageId: "tpl", propertyId: "place", value: "Raum 2", updatedAt: "2026-10-01T10:00:00Z" }],
        views: [{ id: "v1", databaseId: "db", name: "Tabelle", type: "table", config: {}, position: 1 }],
    });
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Besprechungen", exact: true }).click();
    const table = page.getByRole("table");
    await expect(table.getByRole("button", { name: "Kickoff", exact: true })).toBeVisible();
    await expect(table).not.toContainText("Wochentreffen");

    // A new entry from the template has its values and opens.
    await page.getByRole("button", { name: "Vorlagen" }).click();
    await page.getByRole("menuitem", { name: "📅 Wochentreffen" }).click();
    await expect.poll(() => backend.pages.filter((item) => item.title === "Wochentreffen").length).toBe(2);
    await expect(page.getByRole("textbox", { name: "Seitentitel" })).toHaveValue("Wochentreffen");
    await expect(page.getByRole("region", { name: "Eigenschaften" })).toContainText("Raum 2");
    await expect(page.getByRole("note")).toHaveCount(0);

    // Back in the database: the copy is an entry, the template is still left out.
    await page
        .getByRole("button", { name: /Besprechungen/ })
        .first()
        .click();
    await expect(table.getByRole("button", { name: "Wochentreffen", exact: true })).toHaveCount(1);

    // A new template opens as a template.
    await page.getByRole("button", { name: "Vorlagen" }).click();
    await page.getByRole("menuitem", { name: "Neue Vorlage" }).click();
    await expect(page.getByRole("note")).toContainText("Vorlage in „Besprechungen“");
    expect(backend.pages.filter((item) => item.is_template).length).toBe(2);
});
