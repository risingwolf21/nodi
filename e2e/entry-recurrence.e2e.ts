import { createBackend, page as fakePage } from "./fake-supabase";
import { expect, openApp, test } from "./test";

test("Ein Eintrag wiederholt sich wöchentlich; beim Laden werden fällige Kopien angelegt", async ({
    page,
    context,
}) => {
    const backend = createBackend({
        pages: [
            fakePage("db", "Aufgaben", { kind: "database" }),
            fakePage("e1", "Gießen", { parent_id: "db", position: 1 }),
        ],
        properties: [{ id: "due", databaseId: "db", name: "Fällig", type: "date", options: {}, position: 1 }],
        views: [{ id: "v1", databaseId: "db", name: "Tabelle", type: "table", config: {}, position: 1 }],
    });
    await openApp(page, context, backend);
    // Loading the page tree asks the server for due copies.
    await expect.poll(() => backend.recurrenceRuns.length).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Aufgaben", exact: true }).click();
    await page.getByRole("button", { name: "Gießen öffnen" }).click();
    await page.getByRole("button", { name: "Nicht wiederholt" }).click();

    const dialog = page.getByRole("dialog", { name: "Wiederholen" });
    await dialog.getByLabel("Ab").fill("2026-11-02");
    const weekdays = dialog.getByRole("group", { name: "Wochentage" });
    await weekdays.getByRole("button", { name: "Mi" }).click();
    await expect(dialog).toContainText("Wöchentlich am Mo, Mi");
    await expect(dialog.getByLabel("Datum der Kopie in")).toHaveValue("due");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toBeHidden();

    expect(backend.recurrences).toEqual([
        {
            page_id: "e1",
            frequency: "weekly",
            interval: 1,
            weekdays: [1, 3],
            start_date: "2026-11-02",
            date_property_id: "due",
        },
    ]);
    await expect(
        page.getByRole("button", { name: /Wöchentlich am Mo, Mi · nächster Eintrag am 2\. Nov\. 2026/ }),
    ).toBeVisible();

    // Stop repeating.
    await page.getByRole("button", { name: /Wöchentlich am Mo, Mi/ }).click();
    await dialog.getByRole("button", { name: "Nicht mehr wiederholen" }).click();
    await expect(page.getByRole("button", { name: "Nicht wiederholt" })).toBeVisible();
    expect(backend.recurrences).toEqual([]);
});
