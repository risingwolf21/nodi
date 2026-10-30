import { createBackend, page as fakePage } from "./fake-supabase";
import { expect, openApp, test } from "./test";

const NOTES = "b0000000-0000-4000-8000-000000000001";
const PLANS = "b0000000-0000-4000-8000-000000000002";
const UNKNOWN = "b0000000-0000-4000-8000-0000000000ff";

const backend = () => createBackend({ pages: [fakePage(NOTES, "Notizen"), fakePage(PLANS, "Pläne")] });
const title = (page: import("@playwright/test").Page) => page.getByRole("textbox", { name: "Seitentitel" });

// Each page has its own address (package 46).
test("Eine offene Seite steht in der Adresse und bleibt beim Neuladen offen", async ({ page, context }) => {
    await openApp(page, context, backend());
    await page.getByRole("button", { name: "Notizen", exact: true }).click();
    await expect(title(page)).toHaveValue("Notizen");
    await expect(page).toHaveURL(new RegExp(`/nodi/\\?id=${NOTES}$`));

    await page.getByRole("button", { name: "Pläne", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`\\?id=${PLANS}$`));
    await page.reload();
    await expect(title(page)).toHaveValue("Pläne");

    // Back still goes through the pages opened before.
    await page.goBack();
    await expect(title(page)).toHaveValue("Notizen");
    await page.goBack();
    await expect(page).toHaveURL(/\/nodi\/$/);
    await expect(page.getByText("Wähle links eine Seite aus")).toBeVisible();
});

test("Ein Link öffnet die Seite; Zurück führt zur Seitenliste", async ({ page, context }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await openApp(page, context, backend(), { path: `./?id=${NOTES}` });
    await expect(title(page)).toHaveValue("Notizen");

    await page.goBack();
    await expect(page).toHaveURL(/\/nodi\/$/);
    await expect(page.getByRole("button", { name: "Pläne", exact: true })).toBeVisible();
});

test("„Link kopieren“ im Seitenmenü kopiert die Adresse der Seite", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openApp(page, context, backend());
    await page.getByRole("button", { name: "Notizen", exact: true }).click();

    await page.getByRole("button", { name: "Seitenmenü" }).click();
    await page.getByRole("menuitem", { name: "Link kopieren" }).click();
    await expect(page.getByRole("menuitem", { name: "Link kopiert" })).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(new URL(`/nodi/?id=${NOTES}`, page.url()).href);
});

test("Ein Link auf eine unbekannte Seite sagt das und führt zur Seitenliste", async ({ page, context }) => {
    await openApp(page, context, backend(), { path: `./?id=${UNKNOWN}` });
    await expect(page.getByRole("alert").filter({ hasText: "keinen Zugriff" })).toBeVisible();

    await page.getByRole("button", { name: "Zur Seitenliste" }).click();
    await expect(page).toHaveURL(/\/nodi\/$/);
    await expect(page.getByText("Wähle links eine Seite aus")).toBeVisible();
});
