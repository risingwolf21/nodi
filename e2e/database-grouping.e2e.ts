import { STATUS_OPTIONS, taskDatabase } from "./fake-supabase";
import { expect, openApp, test } from "./test";

test("Tabelle und Liste lassen sich nach Status gruppieren; „Neu“ in einer Gruppe setzt ihren Wert", async ({
    page,
    context,
}) => {
    const backend = taskDatabase({
        properties: [
            {
                id: "st",
                databaseId: "db",
                name: "Status",
                type: "status",
                options: { options: STATUS_OPTIONS },
                position: 1,
            },
        ],
        values: [{ pageId: "e1", propertyId: "st", value: "done", updatedAt: "2026-10-02T10:00:00Z" }],
    });
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Aufgaben", exact: true }).click();

    // Not grouped until chosen (unlike a board).
    await expect(page.getByRole("region", { name: /^Gruppe / })).toHaveCount(0);
    await page.getByRole("button", { name: "Gruppieren" }).click();
    await page.getByRole("dialog", { name: "Gruppieren" }).getByRole("button", { name: "Status" }).click();
    await expect.poll(() => backend.views[0].config).toMatchObject({ groupByPropertyId: "st" });

    const group = (name: string) => page.getByRole("region", { name: `Gruppe ${name}`, exact: true });
    await expect(group("Erledigt").getByRole("table")).toContainText("Bericht");
    await expect(group("Ohne Status").getByRole("table")).toContainText("Angebot");
    // Groups without entries are left out.
    await expect(group("In Arbeit")).toHaveCount(0);

    // "Neu" in a group gives the new entry its value.
    await group("Erledigt").getByRole("button", { name: "Neu" }).click();
    await expect.poll(() => backend.propertyCalls.at(-1)).toMatchObject({ p_property_id: "st", p_value: "done" });
    expect(backend.pagesCreated).toBe(1);

    // Folding a group hides its table.
    await group("Erledigt")
        .getByRole("button", { name: /^Erledigt/ })
        .first()
        .click();
    await expect(group("Erledigt").getByRole("table")).toHaveCount(0);

    // A list groups the same way.
    await page.getByRole("button", { name: "Ansicht hinzufügen" }).click();
    await page.getByRole("menuitem", { name: "Liste" }).click();
    await page.getByRole("button", { name: "Gruppieren" }).click();
    await page.getByRole("dialog", { name: "Gruppieren" }).getByRole("button", { name: "Status" }).click();
    await expect(group("Erledigt")).toContainText("Bericht");
    await page.getByRole("tab", { name: "Tabelle" }).click();

    // Back to one table.
    await page.getByRole("button", { name: "Gruppieren" }).click();
    await page.getByRole("dialog", { name: "Gruppieren" }).getByRole("button", { name: "Nicht gruppieren" }).click();
    await expect(page.getByRole("region", { name: /^Gruppe / })).toHaveCount(0);
});
