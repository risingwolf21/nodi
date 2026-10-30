import { createBackend, page as fakePage, taskDatabase } from "./fake-supabase";
import { expect, openApp, test } from "./test";

test("Datenbank anlegen, Einträge, Eigenschaften, Sortierung, Filter und Eintrag; offline nur lesbar", async ({
    page,
    context,
}) => {
    const backend = createBackend({ pages: [fakePage("pa", "Notizen")] });
    await openApp(page, context, backend);
    const table = page.locator("table").first();
    const rowTitles = () => table.locator("tbody tr td:first-child button:first-of-type");

    // A new database opens with the table view.
    await page.getByRole("button", { name: "Neue Datenbank" }).click();
    await expect(page.getByRole("tab", { name: "Tabelle" })).toBeVisible();
    const database = backend.pages.at(-1);
    expect(database?.kind).toBe("database");

    // Entries are named in the table and stay out of the sidebar.
    for (const name of ["Bericht", "Angebot"]) {
        await page.getByRole("button", { name: "Neu", exact: true }).click();
        await page.getByLabel("Name", { exact: true }).fill(name);
        await page.getByLabel("Name", { exact: true }).press("Enter");
        await expect(table.getByRole("button", { name, exact: true })).toBeVisible();
    }
    expect(backend.pages.filter((item) => item.parent_id === database?.id).map((item) => item.title)).toEqual([
        "Bericht",
        "Angebot",
    ]);
    await expect(page.locator("aside").first()).not.toContainText("Bericht");

    // A number and a status property with values.
    await table.getByRole("button", { name: "Eigenschaft hinzufügen" }).click();
    await page.getByRole("menuitem", { name: "Zahl" }).click();
    await page.getByRole("button", { name: "Zahl bearbeiten" }).nth(0).click();
    await page.getByLabel("Zahl", { exact: true }).fill("8");
    await page.getByLabel("Zahl", { exact: true }).press("Enter");
    await page.getByRole("button", { name: "Zahl bearbeiten" }).nth(1).click();
    await page.getByLabel("Zahl", { exact: true }).fill("3,5");
    await page.getByLabel("Zahl", { exact: true }).press("Enter");
    await table.getByRole("button", { name: "Eigenschaft hinzufügen" }).click();
    await page.getByRole("menuitem", { name: "Status" }).click();
    await page.getByRole("button", { name: "Status wählen" }).first().click();
    await page.getByRole("dialog", { name: "Status" }).getByRole("button", { name: "In Arbeit" }).click();
    await expect.poll(() => backend.propertyCalls.map((call) => call.p_value)).toEqual([8, 3.5, "in-progress"]);

    // Sort by number ascending, then keep numbers above 4.
    await page.getByRole("button", { name: /^Sortieren/ }).click();
    const sort = page.getByRole("dialog", { name: "Sortieren" });
    await sort.getByRole("button", { name: "Sortierung hinzufügen" }).click();
    await sort.getByLabel("Eigenschaft").selectOption({ label: "Zahl" });
    await expect(rowTitles()).toHaveText(["Angebot", "Bericht"]);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /^Filter/ }).click();
    const filter = page.getByRole("dialog", { name: "Filter" });
    await filter.getByRole("button", { name: "Filter hinzufügen" }).click();
    await filter.getByLabel("Eigenschaft").selectOption({ label: "Zahl" });
    await filter.getByLabel("Bedingung").selectOption({ label: "größer als" });
    await filter.getByLabel("Wert").fill("4");
    await filter.getByLabel("Wert").press("Enter");
    await expect(rowTitles()).toHaveText(["Bericht"]);
    await page.keyboard.press("Escape");
    // View settings are stored for everyone.
    await expect
        .poll(() => backend.views.find((view) => view.databaseId === database?.id)?.config)
        .toMatchObject({
            sort: [expect.objectContaining({ direction: "asc" })],
            filter: [expect.objectContaining({ operator: "greaterThan", value: "4" })],
        });

    // An entry shows its properties between title and text.
    await table.getByRole("button", { name: "Bericht öffnen" }).click();
    const bar = page.getByRole("region", { name: "Eigenschaften" });
    await expect(bar).toContainText("Zahl");
    await expect(bar).toContainText("8");
    await expect(bar).toContainText("In Arbeit");
    await expect(page.locator(".bn-editor").first()).toBeVisible();

    // Offline the database comes from the cache and is read-only.
    await page.goBack();
    await expect(page.getByRole("tab", { name: "Tabelle" })).toBeVisible();
    backend.offline = true;
    await page.reload();
    await page.getByRole("button", { name: "Unbenannte Datenbank", exact: true }).first().click();
    await expect(rowTitles()).toHaveText(["Bericht"]);
    await expect(page.locator("main")).toContainText("nur lesbar");
    await expect(page.getByRole("button", { name: "Neu", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Eigenschaft hinzufügen" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Zahl bearbeiten" }).first()).toBeDisabled();
});

test("Das Zahlenformat einer Eigenschaft wird im Spaltenmenü gewählt und gespeichert", async ({ page, context }) => {
    const backend = taskDatabase({
        properties: [{ id: "price", databaseId: "db", name: "Preis", type: "number", options: {}, position: 0 }],
        values: [{ pageId: "e1", propertyId: "price", value: 1234.5, updatedAt: "2026-10-01T10:00:00Z" }],
    });
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Aufgaben", exact: true }).click();
    const table = page.getByRole("table");
    await expect(table).toContainText("1.234,5");

    await table.getByRole("button", { name: "Preis", exact: true }).click();
    await page.getByRole("menuitem", { name: "Euro (€)" }).click();
    // Intl separates the symbol with a no-break space.
    await expect(table).toContainText(/1\.234,50\s€/);
    expect(backend.propertyPatches).toContainEqual({ options: { format: "euro" } });

    // From the server after reloading.
    await page.reload();
    await page.getByRole("button", { name: "Aufgaben", exact: true }).click();
    await expect(page.getByRole("table")).toContainText(/1\.234,50\s€/);
});

// Not UTC, so the conversion to local time shows.
test.describe("in Berlin", () => {
    test.use({ timezoneId: "Europe/Berlin" });

    test("Ein Datum bekommt eine Uhrzeit und verliert sie wieder", async ({ page, context }) => {
        const backend = taskDatabase({
            properties: [{ id: "due", databaseId: "db", name: "Fällig", type: "date", options: {}, position: 0 }],
            values: [
                {
                    pageId: "e1",
                    propertyId: "due",
                    value: { start: "2026-10-19", end: null },
                    updatedAt: "2026-10-01T10:00:00Z",
                },
            ],
        });
        await openApp(page, context, backend);
        await page.getByRole("button", { name: "Aufgaben", exact: true }).click();
        const lastValue = () => backend.propertyCalls.at(-1)?.p_value;
        // The browser's local time, as the app stores it.
        const localIso = (hours: number, minutes: number) =>
            page.evaluate(([h, m]) => new Date(2026, 9, 19, h, m).toISOString(), [hours, minutes]);

        // Shown as text like Notion; a click opens the date (package 45b).
        const cell = page.getByRole("button", { name: "Fällig wählen" }).first();
        await expect(cell).toHaveText("19. Okt. 2026");
        await cell.click();
        const picker = page.getByRole("dialog", { name: "Fällig" });
        const toggle = picker.getByRole("switch", { name: "Uhrzeit für Fällig" });
        await expect(toggle).toHaveAttribute("aria-checked", "false");
        await toggle.click();
        await expect.poll(lastValue).toEqual({ start: await localIso(9, 0), end: null });
        const input = picker.getByLabel("Fällig", { exact: true });
        await expect(input).toHaveAttribute("type", "datetime-local");
        await expect(input).toHaveValue("2026-10-19T09:00");

        await input.fill("2026-10-19T14:30");
        await expect.poll(lastValue).toEqual({ start: await localIso(14, 30), end: null });

        await toggle.click();
        await expect.poll(lastValue).toEqual({ start: "2026-10-19", end: null });
        await expect(input).toHaveAttribute("type", "date");

        // An end turns the date into a range; "Leeren" removes it.
        await picker.getByRole("switch", { name: "Enddatum" }).click();
        await expect.poll(lastValue).toEqual({ start: "2026-10-19", end: "2026-10-19" });
        await picker.getByLabel("Fällig: Ende").fill("2026-10-22");
        await expect.poll(lastValue).toEqual({ start: "2026-10-19", end: "2026-10-22" });
        await page.keyboard.press("Escape");
        await expect(cell).toHaveText(/19\. Okt\. 2026\s.\s22\. Okt\. 2026/);
        await cell.click();
        await picker.getByRole("button", { name: "Leeren" }).click();
        await expect.poll(lastValue).toBeNull();
        await expect(cell).toHaveText("");
    });
});
