import { createBackend, MEMBER, page as fakePage } from "./fake-supabase";
import { expect, openApp, test } from "./test";

const DATABASE = "d0000000-0000-4000-8000-000000000001";
const ENTRY = "e0000000-0000-4000-8000-000000000001";

test("Person und Dateien: Mitglied wählen, Datei hochladen, öffnen und entfernen", async ({ page, context }) => {
    const backend = createBackend({
        pages: [
            fakePage(DATABASE, "Aufgaben", { kind: "database" }),
            fakePage(ENTRY, "Bericht", { parent_id: DATABASE, position: 1 }),
        ],
        views: [{ id: "v1", databaseId: DATABASE, name: "Tabelle", type: "table", config: {}, position: 1 }],
    });
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Aufgaben", exact: true }).click();
    const table = page.getByRole("table");

    // A person property offers the members of the workspace.
    await table.getByRole("button", { name: "Eigenschaft hinzufügen" }).click();
    await page.getByRole("menuitem", { name: "Person" }).click();
    await table.getByRole("button", { name: "Person wählen" }).click();
    const people = page.getByRole("dialog", { name: "Person" });
    await people.getByLabel("Person suchen").fill("kim");
    await people.getByRole("button", { name: "kim@nodi.test" }).click();
    await expect.poll(() => backend.propertyCalls.at(-1)?.p_value).toEqual([MEMBER]);
    await page.keyboard.press("Escape");
    await expect(table.getByRole("button", { name: "Person wählen" })).toContainText("kim@nodi.test");

    // Files are uploaded into the entry's folder; the value keeps their paths.
    await table.getByRole("button", { name: "Eigenschaft hinzufügen" }).click();
    await page.getByRole("menuitem", { name: "Dateien & Medien" }).click();
    await table.getByRole("button", { name: "Dateien & Medien anzeigen" }).click();
    const files = page.getByRole("dialog", { name: "Dateien & Medien" });
    await files.getByLabel("Datei auswählen").setInputFiles({
        name: "Plan 2026.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4"),
    });
    await expect(files.getByRole("button", { name: "Plan-2026.pdf", exact: true })).toBeVisible();
    const [path] = [...backend.files.keys()];
    expect(path).toMatch(new RegExp(`^${ENTRY}/[0-9a-f-]{36}-Plan-2026\\.pdf$`));
    await expect.poll(() => backend.propertyCalls.at(-1)?.p_value).toEqual([path]);

    // Opening asks for a signed URL and opens it in a new tab.
    const popup = page.waitForEvent("popup");
    await files.getByRole("button", { name: "Plan-2026.pdf", exact: true }).click();
    await popup;

    await files.getByRole("button", { name: "Plan-2026.pdf entfernen" }).click();
    await expect.poll(() => backend.propertyCalls.at(-1)?.p_value).toBeNull();
    await expect(files).toContainText("Keine Dateien.");
});
