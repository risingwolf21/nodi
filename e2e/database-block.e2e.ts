import { createBackend, page as fakePage } from "./fake-supabase";
import { expect, openApp, test } from "./test";

const NOTES = "b0000000-0000-4000-8000-000000000001";

const workspace = () =>
    createBackend({
        pages: [
            fakePage(NOTES, "Notizen"),
            fakePage("db", "Aufgaben", { kind: "database" }),
            fakePage("e1", "Bericht", { parent_id: "db", position: 1 }),
            fakePage("e2", "Angebot", { parent_id: "db", position: 2 }),
        ],
        views: [{ id: "v1", databaseId: "db", name: "Tabelle", type: "table", config: {}, position: 1 }],
    });

test("„/Datenbank“ bindet eine bestehende Datenbank mit eigenen Ansichten in eine Seite ein", async ({
    page,
    context,
}) => {
    const backend = workspace();
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Notizen", exact: true }).click();

    await page.locator(".bn-editor").first().click();
    await page.keyboard.type("/Datenbank");
    await expect(page.getByRole("option", { name: /Datenbank/ }).first()).toBeVisible();
    await page.keyboard.press("Enter");

    const picker = page.getByRole("group", { name: "Datenbank wählen" });
    // Keys in the block's fields belong to them, not to the editor.
    await picker.getByLabel("Datenbank suchen").pressSequentially("Aufx");
    await page.keyboard.press("Backspace");
    await picker.getByRole("button", { name: "Aufgaben" }).click();

    // Only the database's id is in the text.
    await expect
        .poll(() => JSON.stringify(backend.savedDocuments.get(NOTES) ?? null))
        .toMatch(/"type":"database","props":\{"databaseId":"db"\}/);
    const editor = page.locator(".bn-editor");
    await expect(editor.getByRole("cell", { name: "Bericht" })).toBeVisible();
    await expect(editor.getByRole("cell", { name: "Angebot" })).toBeVisible();
    // Reading writes no views.
    expect(backend.blockViews).toEqual([]);

    // Entries are renamed in the block as on the database's page.
    await editor.getByRole("button", { name: "Bericht", exact: true }).click();
    await page.keyboard.press("End");
    await page.keyboard.type("!!");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Enter");
    await expect.poll(() => backend.pages.find((item) => item.id === "e1")?.title).toBe("Bericht!");
    await expect(editor.getByRole("cell", { name: "Bericht!" })).toBeVisible();

    // A board in the block: the block's table is kept next to it, the database's views stay as they are.
    await editor.getByRole("button", { name: "Ansicht hinzufügen" }).click();
    await page.getByRole("menuitem", { name: "Board" }).click();
    await expect(editor.getByRole("tab", { name: "Board" })).toHaveAttribute("aria-selected", "true");
    expect(backend.blockViews.map((view) => [view.pageId, view.databaseId, view.type])).toEqual([
        [NOTES, "db", "table"],
        [NOTES, "db", "board"],
    ]);
    expect(backend.views).toHaveLength(1);

    // The title opens the database.
    await editor.getByRole("button", { name: "Aufgaben" }).click();
    await expect(page.getByRole("navigation", { name: "Pfad" })).toContainText("Aufgaben");
    await expect(page.locator(".bn-editor")).toHaveCount(0);
});

test("Ein Block ohne verfügbare Datenbank zeigt einen Hinweis; öffentlich wird keine Datenbank gezeigt", async ({
    page,
    context,
}) => {
    const backend = workspace();
    backend.savedDocuments.set(NOTES, [
        { id: "block-1", type: "database", props: { databaseId: "gone" }, children: [] },
    ]);
    backend.publicPages.set("d0000000-0000-4000-8000-000000000003", {
        title: "Öffentlich",
        icon: null,
        full_width: false,
        document: [{ id: "block-1", type: "database", props: { databaseId: "db" }, children: [] }],
    });
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Notizen", exact: true }).click();
    await expect(page.getByText("Diese Datenbank ist nicht verfügbar")).toBeVisible();

    await page.goto("./?p=d0000000-0000-4000-8000-000000000003");
    await expect(page.getByText("Über den öffentlichen Link ist sie nicht sichtbar.")).toBeVisible();
});
