import { createBackend, page as fakePage, STATUS_OPTIONS, taskDatabase } from "./fake-supabase";
import { expect, openApp, test } from "./test";

test("Seitenleiste: Ziehen an den Rand einer Seite ordnet die Geschwister neu", async ({ page, context }) => {
    const backend = createBackend({
        pages: [fakePage("a", "Alpha"), fakePage("b", "Beta"), fakePage("c", "Gamma")],
    });
    await openApp(page, context, backend);
    const titles = () =>
        page
            .getByRole("region", { name: "Privat" })
            .getByRole("button", { name: /^(Alpha|Beta|Gamma)$/ })
            .allTextContents();
    await expect.poll(titles).toEqual(["Alpha", "Beta", "Gamma"]);

    // Onto the upper edge of Alpha: Gamma comes first; the pages get positions (they had none).
    const item = (title: string) => page.getByRole("button", { name: title, exact: true });
    await item("Gamma").dragTo(item("Alpha"), { targetPosition: { x: 20, y: 1 } });
    await expect.poll(titles).toEqual(["Gamma", "Alpha", "Beta"]);
    await expect
        .poll(() => backend.pages.map(({ id, position, parent_id }) => [id, position, parent_id]))
        .toEqual([
            ["a", 1, null],
            ["b", 2, null],
            ["c", 0, null],
        ]);

    // Onto the middle it still becomes a subpage.
    await item("Beta").dragTo(item("Gamma"));
    await expect.poll(() => backend.pages.find((entry) => entry.id === "b")?.parent_id).toBe("c");
});

test("Board: Eine Karte vor eine andere ziehen ändert die Reihenfolge, ohne Sortierung", async ({ page, context }) => {
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
        values: [
            { pageId: "e1", propertyId: "st", value: "todo", updatedAt: "2026-10-02T10:00:00Z" },
            { pageId: "e2", propertyId: "st", value: "todo", updatedAt: "2026-10-02T10:00:00Z" },
        ],
        views: [{ id: "v1", databaseId: "db", name: "Board", type: "board", config: {}, position: 1 }],
    });
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Aufgaben", exact: true }).click();
    const column = page.getByRole("region", { name: "Nicht begonnen", exact: true });
    const cards = () => column.getByRole("button", { name: /^(Bericht|Angebot)/ }).allTextContents();
    await expect.poll(cards).toEqual([expect.stringMatching(/^Bericht/), expect.stringMatching(/^Angebot/)]);

    await column.getByRole("button", { name: /^Angebot/ }).dragTo(column.getByRole("button", { name: /^Bericht/ }));
    await expect.poll(cards).toEqual([expect.stringMatching(/^Angebot/), expect.stringMatching(/^Bericht/)]);
    expect(backend.pages.find((entry) => entry.id === "e2")?.position).toBe(0);
    // Within the column the value stays.
    expect(backend.propertyCalls).toEqual([]);
});
