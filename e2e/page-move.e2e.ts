import { createBackend, page as fakePage } from "./fake-supabase";
import { expect, openApp, test } from "./test";

const tree = () =>
    createBackend({
        pages: [
            fakePage("p1", "Projekt", { visibility: "workspace" }),
            fakePage("p2", "Kapitel", { parent_id: "p1", visibility: "workspace" }),
            fakePage("n1", "Notizen"),
            fakePage("db", "Aufgaben", { kind: "database" }),
            fakePage("e1", "Entwurf", { parent_id: "db", position: 1 }),
        ],
        views: [{ id: "v1", databaseId: "db", name: "Tabelle", type: "table", config: {}, position: 1 }],
    });

test("Eine Seite wird über „Verschieben nach …“ verschoben, mit Rückfrage beim Bereichswechsel", async ({
    page,
    context,
}) => {
    const backend = tree();
    await openApp(page, context, backend);
    const sidebar = page.getByRole("navigation", { name: "Seiten" });

    // Within the workspace: at once.
    await page.getByRole("button", { name: "Kapitel", exact: true }).click();
    await page.getByRole("button", { name: "Seitenmenü" }).click();
    await page.getByRole("menuitem", { name: "Verschieben nach …" }).click();
    let dialog = page.getByRole("dialog", { name: "„Kapitel“ verschieben nach …" });
    await dialog.getByLabel("Ziel suchen").fill("Work");
    await dialog.getByRole("button", { name: "Workspace (oberste Ebene)" }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => backend.pages.find((item) => item.id === "p2")?.parent_id).toBeNull();

    // Into a private page: another section, so the app asks first.
    await page.getByRole("button", { name: "Seitenmenü" }).click();
    await page.getByRole("menuitem", { name: "Verschieben nach …" }).click();
    dialog = page.getByRole("dialog", { name: "„Kapitel“ verschieben nach …" });
    // Not into itself, and not where it already is.
    await expect(dialog.getByRole("button", { name: "Workspace (oberste Ebene)" })).toBeDisabled();
    await dialog.getByRole("button", { name: "Notizen", exact: true }).click();
    await expect(dialog).toContainText("sieht danach nur noch du");
    await dialog.getByRole("button", { name: "Verschieben", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect
        .poll(() => backend.pages.find((item) => item.id === "p2"))
        .toMatchObject({ parent_id: "n1", visibility: "private" });
    // The tree shows it below its new parent, in the private section.
    await expect(sidebar.getByRole("region", { name: "Privat" })).toContainText("Kapitel");
});

test("Ziehen in der Seitenleiste verschiebt eine Seite; in eine Datenbank wird sie zum Eintrag", async ({
    page,
    context,
}) => {
    const backend = tree();
    await openApp(page, context, backend);
    const item = (title: string) => page.getByRole("button", { name: title, exact: true });

    // A page with subpages cannot become an entry: nothing happens.
    await item("Projekt").dragTo(item("Aufgaben"));
    await item("Kapitel").dragTo(item("Projekt"));
    expect(backend.pages.find((entry) => entry.id === "p1")?.parent_id).toBeNull();

    // Within the workspace: onto the section title.
    await item("Kapitel").dragTo(page.getByRole("heading", { name: "Workspace" }));
    await expect.poll(() => backend.pages.find((entry) => entry.id === "p2")?.parent_id).toBeNull();

    // Kapitel has no subpages: it becomes the last entry of Aufgaben (another section: asked first).
    await item("Kapitel").dragTo(item("Aufgaben"));
    const dialog = page.getByRole("dialog", { name: "„Kapitel“ verschieben nach …" });
    await dialog.getByRole("button", { name: "Verschieben", exact: true }).click();
    await expect
        .poll(() => backend.pages.find((entry) => entry.id === "p2"))
        .toMatchObject({ parent_id: "db", position: 2, visibility: "private" });
    await expect(item("Kapitel")).toBeHidden();
});
