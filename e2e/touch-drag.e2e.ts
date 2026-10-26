import type { Locator, Page } from "@playwright/test";
import { createBackend, page as fakePage, STATUS_OPTIONS, taskDatabase } from "./fake-supabase";
import { expect, openApp, test } from "./test";

// Dragging by long press on touch screens (package 41): real touch events via
// CDP, a pause for the long press, then the finger moves to the target.
async function touchDrag(page: Page, from: Locator, to: Locator, target?: { x: number; y: number }) {
    const source = await from.boundingBox();
    const destination = await to.boundingBox();
    if (!source || !destination) throw new Error("Element nicht sichtbar");
    const start = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
    const end = target
        ? { x: destination.x + target.x, y: destination.y + target.y }
        : { x: destination.x + destination.width / 2, y: destination.y + destination.height / 2 };
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
    await page.waitForTimeout(600);
    const steps = 10;
    for (let step = 1; step <= steps; step += 1) {
        const point = {
            x: start.x + ((end.x - start.x) * step) / steps,
            y: start.y + ((end.y - start.y) * step) / steps,
        };
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point] });
        await page.waitForTimeout(20);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
}

test.describe("Telefon", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test("Seitenleiste: langes Drücken und Ziehen ordnet Seiten neu und öffnet keine Seite", async ({
        page,
        context,
    }) => {
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

        const item = (title: string) => page.getByRole("button", { name: title, exact: true });
        await touchDrag(page, item("Gamma"), item("Alpha"), { x: 20, y: 2 });
        await expect.poll(titles).toEqual(["Gamma", "Alpha", "Beta"]);
        // The list stays: the drop is no tap that opens the page.
        await expect(page.getByRole("textbox", { name: "Seitentitel" })).toHaveCount(0);

        // A short tap still opens a page.
        await item("Beta").tap();
        await expect(page.getByRole("textbox", { name: "Seitentitel" })).toHaveValue("Beta");
    });

    test("Wischen über eine Seite scrollt und zieht nichts", async ({ page, context }) => {
        const backend = createBackend({ pages: [fakePage("a", "Alpha"), fakePage("b", "Beta")] });
        await openApp(page, context, backend);
        const item = (title: string) => page.getByRole("button", { name: title, exact: true });
        await expect(item("Alpha")).toBeVisible();
        const box = await item("Beta").boundingBox();
        if (!box) throw new Error("Beta nicht sichtbar");
        const cdp = await page.context().newCDPSession(page);
        const at = { x: box.x + 20, y: box.y + box.height / 2 };
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [at] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: at.x, y: at.y - 60 }] });
        await page.waitForTimeout(600);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await cdp.detach();
        await page.waitForTimeout(100);
        expect(backend.pages.map(({ position, parent_id }) => [position, parent_id])).toEqual([
            [null, null],
            [null, null],
        ]);
    });
});

test.describe("Tablet", () => {
    test.use({ viewport: { width: 1024, height: 1366 }, hasTouch: true, isMobile: true });

    test("Board: eine Karte per langem Drücken in eine andere Spalte ziehen setzt den Wert", async ({
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
            values: [{ pageId: "e1", propertyId: "st", value: "todo", updatedAt: "2026-10-02T10:00:00Z" }],
            views: [{ id: "v1", databaseId: "db", name: "Board", type: "board", config: {}, position: 1 }],
        });
        await openApp(page, context, backend);
        await page.getByRole("button", { name: "Aufgaben", exact: true }).tap();
        const column = (name: string) => page.getByRole("region", { name, exact: true });
        await expect(column("Nicht begonnen").getByRole("button", { name: /Bericht/ })).toBeVisible();

        await column("Erledigt").scrollIntoViewIfNeeded();
        await touchDrag(page, column("Nicht begonnen").getByRole("button", { name: /Bericht/ }), column("Erledigt"));
        await expect(column("Erledigt").getByRole("button", { name: /Bericht/ })).toBeVisible();
        expect(backend.propertyCalls.at(-1)).toMatchObject({ p_page_id: "e1", p_property_id: "st", p_value: "done" });
        // The card was dropped, not opened.
        await expect(page.getByRole("region", { name: "Eigenschaften" })).toHaveCount(0);
    });

    test("Board: am Rand scrollt es beim Ziehen weiter, bis die Zielspalte zu sehen ist", async ({ page, context }) => {
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
            values: [{ pageId: "e1", propertyId: "st", value: "todo", updatedAt: "2026-10-02T10:00:00Z" }],
            views: [{ id: "v1", databaseId: "db", name: "Board", type: "board", config: {}, position: 1 }],
        });
        await page.setViewportSize({ width: 700, height: 1000 });
        await openApp(page, context, backend);
        await page.getByRole("button", { name: "Aufgaben", exact: true }).tap();
        const column = (name: string) => page.getByRole("region", { name, exact: true });
        const card = column("Nicht begonnen").getByRole("button", { name: /Bericht/ });
        await expect(card).toBeVisible();
        await expect(column("Erledigt")).not.toBeInViewport();

        const box = await card.boundingBox();
        if (!box) throw new Error("Karte nicht sichtbar");
        const cdp = await page.context().newCDPSession(page);
        const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
        await page.waitForTimeout(600);
        // Held at the right edge, the board scrolls until "Erledigt" is in view.
        const edge = { x: 695, y: start.y };
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [edge] });
        await expect(column("Erledigt")).toBeInViewport({ ratio: 0.9 });
        const target = await column("Erledigt").boundingBox();
        if (!target) throw new Error("Spalte nicht sichtbar");
        await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x: target.x + target.width / 2, y: target.y + 40 }],
        });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await cdp.detach();
        await expect(column("Erledigt").getByRole("button", { name: /Bericht/ })).toBeVisible();
    });

    test("Kalender: einen Eintrag per langem Drücken auf einen anderen Tag ziehen", async ({ page, context }) => {
        await page.clock.setFixedTime(new Date("2026-10-19T10:00:00"));
        const backend = taskDatabase({
            properties: [{ id: "due", databaseId: "db", name: "Fällig", type: "date", options: {}, position: 1 }],
            values: [
                {
                    pageId: "e1",
                    propertyId: "due",
                    value: { start: "2026-10-10", end: null },
                    updatedAt: "2026-10-02T10:00:00Z",
                },
            ],
            views: [{ id: "v1", databaseId: "db", name: "Kalender", type: "calendar", config: {}, position: 1 }],
        });
        await openApp(page, context, backend);
        await page.getByRole("button", { name: "Aufgaben", exact: true }).tap();
        const calendar = page.getByRole("region", { name: "Kalender" });
        const day = (label: string) => calendar.getByRole("group", { name: label, exact: true });

        await touchDrag(page, day("10. Oktober").getByRole("button", { name: "Bericht" }), day("14. Oktober"));
        await expect
            .poll(() => backend.propertyCalls.at(-1))
            .toMatchObject({ p_page_id: "e1", p_property_id: "due", p_value: { start: "2026-10-14", end: null } });
        await expect(day("14. Oktober").getByRole("button", { name: "Bericht" })).toBeVisible();
    });
});
