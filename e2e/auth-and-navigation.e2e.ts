import { createBackend, page as fakePage } from "./fake-supabase";
import { expect, openApp, test } from "./test";

const pageTitle = (page: import("@playwright/test").Page) => page.getByLabel("Seitentitel");

test("Anmelden zeigt Fehler, Registrieren bittet um Bestätigung, dann geht es in den Workspace", async ({
    page,
    context,
}) => {
    const backend = createBackend({ pages: [fakePage("pa", "Notizen")], login: "invalid" });
    await openApp(page, context, backend, { signedIn: false });

    await page.getByLabel("E-Mail-Adresse").fill("owner@nodi.test");
    await page.getByLabel("Passwort").fill("geheim1234");
    await page.getByRole("button", { name: "Anmelden" }).click();
    await expect(page.getByRole("alert")).toHaveText("Invalid login credentials");

    await page.getByRole("button", { name: "Registrieren" }).click();
    await page.getByLabel("Passwort").fill("geheim1234");
    await page.getByRole("button", { name: "Konto erstellen" }).click();
    await expect(page.getByRole("status")).toHaveText(
        "Dein Konto wurde angelegt. Bitte bestätige gegebenenfalls deine E-Mail-Adresse.",
    );
    expect(backend.signups).toBe(1);

    backend.login = "ok";
    await page.getByRole("button", { name: "Anmelden" }).last().click();
    await page.getByLabel("Passwort").fill("geheim1234");
    await page.getByRole("button", { name: "Anmelden" }).first().click();
    await expect(page.getByRole("button", { name: "Notizen", exact: true })).toBeVisible();
});

test("Offene Seiten folgen dem Browser-Verlauf, Neuladen öffnet keine alte Seite", async ({ page, context }) => {
    await openApp(page, context, createBackend({ pages: [fakePage("pa", "Notizen A"), fakePage("pb", "Notizen B")] }));

    await page.getByRole("button", { name: "Notizen A", exact: true }).click();
    await expect(pageTitle(page)).toHaveValue("Notizen A");
    await page.getByRole("button", { name: "Notizen B", exact: true }).click();
    await expect(pageTitle(page)).toHaveValue("Notizen B");

    await page.goBack();
    await expect(pageTitle(page)).toHaveValue("Notizen A");
    await page.goBack();
    await expect(pageTitle(page)).toHaveCount(0);
    await page.goForward();
    await expect(pageTitle(page)).toHaveValue("Notizen A");

    await page.reload();
    await expect(page.getByRole("button", { name: "Notizen A", exact: true })).toBeVisible();
    await expect(pageTitle(page)).toHaveCount(0);
});

test("Mobil schließt der Zurück-Pfeil die Seite", async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openApp(page, context, createBackend({ pages: [fakePage("pa", "Notizen")] }));

    await page.getByRole("button", { name: "Notizen", exact: true }).click();
    await expect(pageTitle(page)).toHaveValue("Notizen");
    await page.getByRole("button", { name: "Zurück zur Seitenliste" }).click();
    await expect(pageTitle(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Notizen", exact: true })).toBeVisible();
});
