import { STATUS_OPTIONS, taskDatabase, type FakeBackend } from "./fake-supabase";
import { expect, openApp, test } from "./test";

function boardDatabase(): FakeBackend {
    return taskDatabase({
        properties: [
            {
                id: "st",
                databaseId: "db",
                name: "Status",
                type: "status",
                options: { options: STATUS_OPTIONS },
                position: 1,
            },
            { id: "num", databaseId: "db", name: "Aufwand", type: "number", options: {}, position: 2 },
        ],
        values: [
            { pageId: "e1", propertyId: "st", value: "todo", updatedAt: "2026-10-02T10:00:00Z" },
            { pageId: "e2", propertyId: "num", value: 5, updatedAt: "2026-10-02T10:00:00Z" },
        ],
    });
}

test.describe("Board, Liste und Galerie", () => {
    test("Board gruppiert nach Status; Ziehen setzt den Wert; „Neu“ in einer Spalte legt genau einen Eintrag an", async ({
        page,
        context,
    }) => {
        const backend = boardDatabase();
        await openApp(page, context, backend);
        await page.getByRole("button", { name: "Aufgaben", exact: true }).click();
        await page.getByRole("button", { name: "Ansicht hinzufügen" }).click();
        await page.getByRole("menuitem", { name: "Board" }).click();
        const column = (name: string) => page.getByRole("region", { name, exact: true });

        // The board's columns; the page's comments are a section too.
        await expect(page.locator('section[aria-label]:not([aria-label="Kommentare"])')).toHaveCount(4);
        await expect(page.getByRole("button", { name: "Gruppieren" })).toHaveText("Gruppieren: Status");
        await expect(column("Ohne Status").getByRole("button", { name: /Angebot/ })).toBeVisible();

        await column("Erledigt").scrollIntoViewIfNeeded();
        await column("Nicht begonnen")
            .getByRole("button", { name: /Bericht/ })
            .dragTo(column("Erledigt"));
        await expect(column("Erledigt").getByRole("button", { name: /Bericht/ })).toBeVisible();
        expect(backend.propertyCalls.at(-1)).toMatchObject({ p_page_id: "e1", p_property_id: "st", p_value: "done" });

        // A quick double click must not create two entries.
        const created = backend.pagesCreated;
        await column("In Arbeit")
            .getByRole("button", { name: "Neu" })
            .evaluate((button: HTMLButtonElement) => {
                button.click();
                button.click();
            });
        await expect(page.getByRole("region", { name: "Eigenschaften" })).toContainText("In Arbeit");
        expect(backend.pagesCreated - created).toBe(1);
        expect(backend.propertyCalls.at(-1)).toMatchObject({ p_page_id: backend.pages.at(-1)?.id, p_value: "doing" });
    });

    test("Liste und Galerie zeigen alle Einträge; offline kein Ziehen und kein „Neu“", async ({ page, context }) => {
        const backend = boardDatabase();
        await openApp(page, context, backend);
        await page.getByRole("button", { name: "Aufgaben", exact: true }).click();

        await page.getByRole("button", { name: "Ansicht hinzufügen" }).click();
        await page.getByRole("menuitem", { name: "Liste" }).click();
        await expect(page.locator("main ul").first()).toContainText("Bericht");
        await expect(page.locator("main ul").first()).toContainText("Angebot");

        await page.getByRole("button", { name: "Ansicht hinzufügen" }).click();
        await page.getByRole("menuitem", { name: "Galerie" }).click();
        // Two entry cards, plus "Neu".
        await expect(page.locator("main .grid > button")).toHaveText([/Bericht/, /Angebot/, /Neu/]);

        await page.getByRole("button", { name: "Ansicht hinzufügen" }).click();
        await page.getByRole("menuitem", { name: "Board" }).click();
        await expect(page.locator("button[draggable=true]")).toHaveCount(2);
        expect(backend.views.map((view) => view.type)).toEqual(["table", "list", "gallery", "board"]);

        backend.offline = true;
        await page.reload();
        await page.getByRole("button", { name: "Aufgaben", exact: true }).click();
        await page.getByRole("tab", { name: "Board" }).click();
        await expect(page.locator("main")).toContainText("nur lesbar");
        await expect(page.locator("button[draggable=true]")).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Neu" })).toHaveCount(0);
    });

    test("Board ohne Status- oder Auswahl-Eigenschaft bietet an, eine anzulegen", async ({ page, context }) => {
        const backend = boardDatabase();
        backend.properties = backend.properties.filter((property) => property.id !== "st");
        backend.views.push({ id: "v2", databaseId: "db", name: "Board", type: "board", config: {}, position: 2 });
        await openApp(page, context, backend);
        await page.getByRole("button", { name: "Aufgaben", exact: true }).click();
        await page.getByRole("tab", { name: "Board" }).click();
        await expect(page.getByRole("button", { name: "Status-Eigenschaft anlegen" })).toBeVisible();
    });
});

test.describe("Feed und Kalender", () => {
    function calendarDatabase(): FakeBackend {
        return taskDatabase({
            properties: [
                { id: "num", databaseId: "db", name: "Aufwand", type: "number", options: {}, position: 1 },
                { id: "due", databaseId: "db", name: "Fällig", type: "date", options: {}, position: 2 },
            ],
            values: [
                { pageId: "e2", propertyId: "num", value: 5, updatedAt: "2026-10-02T10:00:00Z" },
                {
                    pageId: "e1",
                    propertyId: "due",
                    value: { start: "2026-10-10", end: "2026-10-12" },
                    updatedAt: "2026-10-02T10:00:00Z",
                },
            ],
            previews: [
                {
                    pageId: "e1",
                    updatedAt: "2026-10-05T10:00:00Z",
                    block0: { type: "heading", content: [{ type: "text", text: "Quartalsbericht", styles: {} }] },
                    block1: { type: "paragraph", content: [{ type: "text", text: "Umsatz gestiegen.", styles: {} }] },
                    block2: null,
                    pages: { parent_id: "db" },
                },
            ],
        });
    }

    test.beforeEach(async ({ page }) => {
        // The calendar opens at the current month; the dates above are in October 2026.
        await page.clock.setFixedTime(new Date("2026-10-19T10:00:00"));
    });

    test("Feed zeigt den Anfang des Textes, auch offline aus dem Cache", async ({ page, context }) => {
        const backend = calendarDatabase();
        await openApp(page, context, backend);
        await page.getByRole("button", { name: "Aufgaben", exact: true }).click();
        await page.getByRole("button", { name: "Ansicht hinzufügen" }).click();
        await page.getByRole("menuitem", { name: "Feed" }).click();
        const bericht = page.locator("main article").filter({ hasText: "Bericht" });
        await expect(bericht).toContainText("Quartalsbericht");
        await expect(bericht).toContainText("Umsatz gestiegen.");

        backend.offline = true;
        await page.reload();
        await page.getByRole("button", { name: "Aufgaben", exact: true }).click();
        await page.getByRole("tab", { name: "Feed" }).click();
        await expect(page.locator("main")).toContainText("Umsatz gestiegen.");
        await expect(page.getByRole("button", { name: "Neu" })).toHaveCount(0);
    });

    test("Kalender zeigt Zeiträume an jedem Tag; „+“ an einem Tag legt einen Eintrag mit Datum an", async ({
        page,
        context,
    }) => {
        const backend = calendarDatabase();
        await openApp(page, context, backend);
        await page.getByRole("button", { name: "Aufgaben", exact: true }).click();
        await page.getByRole("button", { name: "Ansicht hinzufügen" }).click();
        await page.getByRole("menuitem", { name: "Kalender" }).click();
        const calendar = page.getByRole("region", { name: "Kalender" });

        await expect(page.getByRole("button", { name: "Datum" })).toContainText("Fällig");
        await expect(calendar.getByRole("button", { name: "Bericht" })).toHaveCount(3);
        await page.getByRole("button", { name: "Nächster Monat" }).click();
        await expect(calendar.getByRole("button", { name: "Bericht" })).toHaveCount(0);
        await page.getByRole("button", { name: "Heute" }).click();

        const day = calendar.getByRole("group").filter({ hasText: /^15/ }).first();
        await day.hover();
        await day.getByRole("button", { name: /Neuer Eintrag am/ }).click();
        await expect(page.getByRole("region", { name: "Eigenschaften" })).toBeVisible();
        expect(backend.propertyCalls.at(-1)).toMatchObject({
            p_page_id: backend.pages.at(-1)?.id,
            p_property_id: "due",
            p_value: { start: "2026-10-15", end: null },
        });
    });

    test("Kalender: Woche zeigen; Ziehen auf einen anderen Tag verschiebt den Zeitraum", async ({ page, context }) => {
        const backend = calendarDatabase();
        await openApp(page, context, backend);
        await page.getByRole("button", { name: "Aufgaben", exact: true }).click();
        await page.getByRole("button", { name: "Ansicht hinzufügen" }).click();
        await page.getByRole("menuitem", { name: "Kalender" }).click();
        const calendar = page.getByRole("region", { name: "Kalender" });
        const day = (label: string) => calendar.getByRole("group", { name: label, exact: true });

        // Dragged from its first day (10 Oct) to 13 Oct: 10–12 becomes 13–15.
        await day("10. Oktober").getByRole("button", { name: "Bericht" }).dragTo(day("13. Oktober"));
        await expect
            .poll(() => backend.propertyCalls.at(-1))
            .toMatchObject({
                p_page_id: "e1",
                p_property_id: "due",
                p_value: { start: "2026-10-13", end: "2026-10-15" },
            });
        await expect(day("15. Oktober").getByRole("button", { name: "Bericht" })).toBeVisible();

        // The week of today (19 Oct); back one week shows 13–15 Oct.
        await page.getByRole("button", { name: "Woche", exact: true }).click();
        await expect(page.getByRole("heading", { name: /19\. Okt\. 2026 – 25\. Okt\. 2026/ })).toBeVisible();
        await expect(calendar.getByRole("group")).toHaveCount(7);
        await expect(calendar.getByRole("button", { name: "Bericht" })).toHaveCount(0);
        await page.getByRole("button", { name: "Vorherige Woche" }).click();
        await expect(calendar.getByRole("button", { name: "Bericht" })).toHaveCount(3);
    });

    test("Zeitleiste zeigt Einträge als Balken über ihren Zeitraum", async ({ page, context }) => {
        const backend = calendarDatabase();
        await openApp(page, context, backend);
        await page.getByRole("button", { name: "Aufgaben", exact: true }).click();
        await page.getByRole("button", { name: "Ansicht hinzufügen" }).click();
        await page.getByRole("menuitem", { name: "Zeitleiste" }).click();
        await expect.poll(() => backend.views.map(({ type }) => type)).toContain("timeline");
        const timeline = page.getByRole("region", { name: "Zeitleiste" });

        // From the Monday before last (12 Oct): Bericht (10–12 Oct) starts before, one day is shown.
        await expect(page.getByRole("heading", { name: /12\. Okt\. 2026 – 22\. Nov\. 2026/ })).toBeVisible();
        const bar = timeline.getByRole("button", { name: "Bericht" });
        await expect(bar).toHaveCSS("width", "28px");
        await expect(page.getByText("1 Eintrag ohne Fällig")).toBeVisible();

        // Two weeks earlier all three days are there.
        await page.getByRole("button", { name: "Früher" }).click();
        await expect(bar).toHaveCSS("width", `${3 * 32 - 4}px`);
        await bar.click();
        await expect(page.getByRole("region", { name: "Eigenschaften" })).toBeVisible();
    });

    test("Kalender ohne Datums-Eigenschaft bietet an, eine anzulegen; mobil ohne seitliches Scrollen", async ({
        page,
        context,
    }) => {
        const backend = calendarDatabase();
        backend.views.push({ id: "v2", databaseId: "db", name: "Kalender", type: "calendar", config: {}, position: 2 });
        await page.setViewportSize({ width: 390, height: 844 });
        await openApp(page, context, backend);
        await page.getByRole("button", { name: "Aufgaben", exact: true }).click();
        await page.getByRole("tab", { name: "Kalender" }).click();
        await expect(
            page.getByRole("region", { name: "Kalender" }).getByRole("button", { name: "Bericht" }),
        ).toHaveCount(3);
        expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);

        backend.properties = backend.properties.filter((property) => property.id !== "due");
        await page.reload();
        await page.getByRole("button", { name: "Aufgaben", exact: true }).click();
        await page.getByRole("tab", { name: "Kalender" }).click();
        await expect(page.getByRole("button", { name: "Datums-Eigenschaft anlegen" })).toBeVisible();
    });
});
