import { taskDatabase, type FakeBackend } from "./fake-supabase";
import { expect, openApp, test } from "./test";

function invoiceDatabase(): FakeBackend {
    return taskDatabase({
        properties: [
            { id: "preis", databaseId: "db", name: "Preis", type: "number", options: {}, position: 1 },
            { id: "menge", databaseId: "db", name: "Menge", type: "number", options: {}, position: 2 },
            {
                id: "gesamt",
                databaseId: "db",
                name: "Gesamt",
                type: "formula",
                options: { expression: 'prop("Preis") * prop("Menge")' },
                position: 3,
            },
            {
                id: "kaputt",
                databaseId: "db",
                name: "Kaputt",
                type: "formula",
                options: { expression: 'prop("Gibt es nicht")' },
                position: 4,
            },
        ],
        values: [
            { pageId: "e1", propertyId: "preis", value: 12.5, updatedAt: "2026-10-02T10:00:00Z" },
            { pageId: "e1", propertyId: "menge", value: 4, updatedAt: "2026-10-02T10:00:00Z" },
            { pageId: "e2", propertyId: "preis", value: 100, updatedAt: "2026-10-02T10:00:00Z" },
            { pageId: "e2", propertyId: "menge", value: 2, updatedAt: "2026-10-02T10:00:00Z" },
        ],
    });
}

test("Formeln rechnen sofort, zeigen Fehler, lassen sich anlegen, sortieren und offline berechnen", async ({
    page,
    context,
}) => {
    const backend = invoiceDatabase();
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Aufgaben", exact: true }).click();
    const row = (name: string) => page.locator("tbody tr").filter({ hasText: name }).first();

    await expect(row("Bericht")).toContainText("50");
    await expect(row("Angebot")).toContainText("200");
    await expect(row("Bericht").locator(".text-destructive").first()).toHaveAttribute(
        "title",
        "Die Eigenschaft „Gibt es nicht“ gibt es nicht.",
    );

    // A changed value updates the formula at once.
    await row("Bericht").getByRole("button", { name: "Menge bearbeiten" }).click();
    await page.getByLabel("Menge", { exact: true }).fill("10");
    await page.getByLabel("Menge", { exact: true }).press("Enter");
    await expect(row("Bericht")).toContainText("125");

    // A new formula opens the editor: syntax error, preview, save.
    await page.locator("thead").getByRole("button", { name: "Eigenschaft hinzufügen" }).click();
    await page.getByRole("menuitem", { name: "Formel" }).click();
    const editor = page.getByRole("dialog", { name: /Formel „Formel“/ });
    const input = editor.getByLabel("Formel", { exact: true });
    await input.fill("1 +");
    await expect(editor.locator("[aria-live]")).toHaveText("Unerwartet: das Ende an Stelle 4.");
    await input.fill("");
    await editor.getByRole("button", { name: /^Preis$/ }).click();
    await input.press("End");
    await input.pressSequentially(' > 50 ? "teuer" : "günstig"');
    await expect(editor.locator("[aria-live]")).toContainText("günstig");
    await editor.getByRole("button", { name: "Speichern" }).click();
    await expect(editor).toHaveCount(0);
    expect(backend.propertyPatches.at(-1)).toEqual({
        options: { expression: 'prop("Preis") > 50 ? "teuer" : "günstig"' },
    });
    await expect(row("Angebot")).toContainText("teuer");

    // Sort by the formula, descending.
    await page.getByRole("button", { name: /^Sortieren/ }).click();
    const sort = page.getByRole("dialog", { name: "Sortieren" });
    await sort.getByRole("button", { name: "Sortierung hinzufügen" }).click();
    await sort.getByLabel("Eigenschaft").selectOption({ label: "Gesamt" });
    await sort.getByLabel("Richtung").selectOption({ label: "Absteigend" });
    await page.keyboard.press("Escape");
    await expect(page.locator("tbody tr td:first-child button:first-of-type")).toHaveText(["Angebot", "Bericht"]);

    // The column header edits the stored expression.
    await page.locator("thead").getByRole("button", { name: "Gesamt" }).click();
    await page.getByRole("menuitem", { name: "Formel bearbeiten" }).click();
    const gesamt = page.getByRole("dialog", { name: /Formel „Gesamt“/ });
    await expect(gesamt.getByLabel("Formel", { exact: true })).toHaveValue('prop("Preis") * prop("Menge")');
    await gesamt.getByRole("button", { name: "Abbrechen" }).click();

    // In an entry the property bar shows the results; the name opens the editor.
    await row("Angebot").getByRole("button", { name: "Angebot öffnen" }).click();
    const bar = page.getByRole("region", { name: "Eigenschaften" });
    await expect(bar).toContainText(/Gesamt\s*200/);
    await bar.getByRole("button", { name: "Formel „Gesamt“ bearbeiten" }).click();
    await expect(page.getByRole("dialog", { name: /Formel „Gesamt“/ }).locator("[aria-live]")).toHaveText(
        "Ergebnis für „Angebot“: 200",
    );
    await page.keyboard.press("Escape");

    // Offline the results are computed from the cache.
    backend.offline = true;
    await page.reload();
    await page.getByRole("button", { name: "Aufgaben", exact: true }).click();
    await expect(row("Angebot")).toContainText("200");
    await expect(row("Angebot")).toContainText("teuer");
});
