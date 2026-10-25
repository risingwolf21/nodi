import { page as fakePage, taskDatabase, type FakeBackend } from "./fake-supabase";
import { expect, openApp, test } from "./test";

function placeDatabase(): FakeBackend {
    const backend = taskDatabase({
        properties: [{ id: "ort", databaseId: "db", name: "Ort", type: "place", options: {}, position: 1 }],
        values: [
            {
                pageId: "e1",
                propertyId: "ort",
                value: { lat: 48.1372, lng: 11.5756, label: "Marienplatz, München" },
                updatedAt: "2026-10-02T10:00:00Z",
            },
            {
                pageId: "e3",
                propertyId: "ort",
                value: { lat: 52.52, lng: 13.405, label: null },
                updatedAt: "2026-10-02T10:00:00Z",
            },
        ],
    });
    // A title that would run script if it were rendered as HTML.
    backend.pages.push(fakePage("e3", "<img src=x onerror=window.__xss=1>", { parent_id: "db", position: 3 }));
    return backend;
}

test("Ort per Adresssuche und per Klick auf die Karte setzen", async ({ page, context }) => {
    const backend = placeDatabase();
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Aufgaben", exact: true }).click();
    const angebot = page.locator("tbody tr").filter({ hasText: "Angebot" });

    await angebot.getByRole("button", { name: "Ort wählen" }).click();
    const picker = page.getByRole("dialog", { name: "Ort" });
    await picker.getByLabel("Adresse suchen").fill("Frauenkirche");
    await picker.getByLabel("Adresse suchen").press("Enter");
    await picker.getByRole("button", { name: /Frauenkirche/ }).click();
    await expect
        .poll(() => backend.propertyCalls.at(-1)?.p_value)
        .toEqual({
            lat: 48.1351,
            lng: 11.582,
            label: "Frauenkirche, München, Bayern, Deutschland",
        });
    expect(backend.geocodingRequests).toHaveLength(1);
    expect(backend.geocodingRequests[0].get("q")).toBe("Frauenkirche");

    // A click on the small map sets a point without an address.
    await angebot.getByRole("button", { name: "Ort wählen" }).click();
    const smallMap = page.getByRole("region", { name: "Karte für Ort" });
    // Clicks only count once the map has its size and tiles.
    await expect(smallMap.locator(".leaflet-tile-loaded").first()).toBeVisible();
    const box = await smallMap.boundingBox();
    if (!box) throw new Error("Die kleine Karte ist nicht sichtbar.");
    await page.mouse.click(box.x + box.width / 2 + 20, box.y + box.height / 2);
    await expect
        .poll(() => backend.propertyCalls.at(-1)?.p_value)
        .toEqual({ lat: expect.any(Number), lng: expect.any(Number), label: null });
});

test("Landkarte zeigt Marker mit Quellenangabe, Titel nur als Text; Klick öffnet den Eintrag; offline Marker aus dem Cache", async ({
    page,
    context,
}) => {
    const backend = placeDatabase();
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Aufgaben", exact: true }).click();
    await page.getByRole("button", { name: "Ansicht hinzufügen" }).click();
    await page.getByRole("menuitem", { name: "Landkarte" }).click();
    const map = page.getByRole("region", { name: "Landkarte nach Ort" });
    const markers = map.locator("path.nodi-map-marker");

    await expect(markers).toHaveCount(2);
    await expect(map.locator(".leaflet-tile-loaded").first()).toBeVisible();
    await expect(map.locator(".leaflet-control-attribution")).toContainText("OpenStreetMap");
    expect(backend.tiles).toBeGreaterThan(0);
    await expect(page.locator("main")).toContainText("1 Eintrag ohne Ort");

    // Like the click below: a hover could miss the marker while the map still zooms to fit.
    await markers.nth(1).dispatchEvent("mouseover");
    await expect(page.locator(".leaflet-tooltip")).toHaveText("<img src=x onerror=window.__xss=1>");
    expect(await page.evaluate(() => document.querySelectorAll(".leaflet-tooltip img").length)).toBe(0);

    // Leaflet handles clicks on markers; a DOM click does not depend on the zoom animation.
    await markers.first().dispatchEvent("click");
    await expect(page.getByRole("region", { name: "Eigenschaften" })).toContainText("Marienplatz");

    backend.offline = true;
    await page.reload();
    await page.getByRole("button", { name: "Aufgaben", exact: true }).click();
    await page.getByRole("tab", { name: "Landkarte" }).click();
    await expect(page.getByRole("region", { name: "Landkarte nach Ort" }).locator("path.nodi-map-marker")).toHaveCount(
        2,
    );
    await expect(page.locator("main")).toContainText("nur lesbar");
    await expect(page.getByRole("button", { name: "Neu" })).toHaveCount(0);
});
