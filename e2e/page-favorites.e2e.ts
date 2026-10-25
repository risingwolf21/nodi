import { createBackend, page as fakePage } from "./fake-supabase";
import { expect, openApp, test } from "./test";

test("Favoriten: über das Seitenmenü hinzufügen, oben in der Seitenleiste öffnen, entfernen", async ({
    page,
    context,
}) => {
    const backend = createBackend({
        pages: [
            fakePage("b0000000-0000-4000-8000-000000000001", "Notizen"),
            fakePage("b0000000-0000-4000-8000-000000000002", "Reise", { icon: "✈️" }),
        ],
    });
    await openApp(page, context, backend);
    const favorites = page.getByRole("region", { name: "Favoriten" });
    await expect(favorites).toHaveCount(0);

    await page.getByRole("button", { name: "Reise", exact: true }).click();
    await page.getByRole("button", { name: "Seitenmenü" }).click();
    await page.getByRole("menuitem", { name: "Zu Favoriten hinzufügen" }).click();
    await expect(favorites.getByRole("button", { name: "✈️ Reise" })).toBeVisible();
    expect(backend.favorites).toEqual(["b0000000-0000-4000-8000-000000000002"]);

    // Stored on the server: after a reload the section is still there and opens the page.
    await page.reload();
    await page.getByRole("button", { name: "Notizen", exact: true }).click();
    await favorites.getByRole("button", { name: "✈️ Reise" }).click();
    await expect(page.getByRole("navigation", { name: "Pfad" })).toContainText("Reise");

    await page.getByRole("button", { name: "Seitenmenü" }).click();
    await page.getByRole("menuitem", { name: "Aus Favoriten entfernen" }).click();
    await expect(favorites).toHaveCount(0);
    expect(backend.favorites).toEqual([]);
});
