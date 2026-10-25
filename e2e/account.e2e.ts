import { createBackend, installFakeSupabase, page as fakePage, recoveryHash } from "./fake-supabase";
import { expect, openApp, test } from "./test";

test("Passwort vergessen: Link anfordern, über den Link ein neues Passwort festlegen", async ({ page, context }) => {
    const backend = createBackend({ pages: [fakePage("pa", "Notizen")] });
    await openApp(page, context, backend, { signedIn: false });

    await page.getByRole("button", { name: "Passwort vergessen?" }).click();
    await page.getByLabel("E-Mail-Adresse").fill("owner@nodi.test");
    await page.getByRole("button", { name: "Link senden" }).click();
    await expect(page.getByRole("status")).toContainText("Link zum Zurücksetzen");
    expect(backend.passwordResets).toEqual([
        { email: "owner@nodi.test", redirectTo: expect.stringMatching(/\/nodi\/$/) as unknown },
    ]);

    // The link from the e-mail signs in for the reset; the app asks for the new password first.
    // A new load, as from the e-mail (only changing the hash would not reload the app).
    await page.goto("about:blank");
    await page.goto(`./${recoveryHash()}`);
    await expect(page.getByText("Neues Passwort festlegen")).toBeVisible();
    await page.getByLabel("Neues Passwort").fill("neu-geheim-1234");
    await page.getByRole("button", { name: "Passwort speichern" }).click();
    await expect(page.getByRole("button", { name: "Notizen", exact: true })).toBeVisible();
    expect(backend.newPasswords).toEqual(["neu-geheim-1234"]);
});

test("Konto löschen: falsches Passwort wird abgelehnt, dann ist das Konto weg und die lokalen Daten auch", async ({
    page,
    context,
}) => {
    const backend = createBackend({ pages: [fakePage("pa", "Notizen")] });
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Notizen", exact: true }).click();
    await expect(page.locator(".bn-editor")).toBeVisible();

    await page.getByRole("button", { name: "Workspace und Konto" }).click();
    await page.getByRole("menuitem", { name: "Konto löschen …" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Konto löschen" });
    await expect(dialog).toContainText("lässt sich nicht rückgängig machen");

    backend.login = "invalid";
    await dialog.getByLabel("Zur Bestätigung dein Passwort").fill("falsch");
    await dialog.getByRole("button", { name: "Konto endgültig löschen" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Das Passwort stimmt nicht.");
    expect(backend.accountDeleted).toBe(false);

    backend.login = "ok";
    await dialog.getByLabel("Zur Bestätigung dein Passwort").fill("geheim1234");
    await dialog.getByRole("button", { name: "Konto endgültig löschen" }).click();
    await expect(page.getByText("Willkommen zurück")).toBeVisible();
    expect(backend.accountDeleted).toBe(true);
    await expect
        .poll(() => page.evaluate(async () => (await indexedDB.databases()).map((database) => database.name)))
        .toEqual([]);
});

test("Impressum und Datenschutz sind ohne Anmeldung erreichbar und zeigen offene Platzhalter", async ({
    page,
    context,
}) => {
    await installFakeSupabase(context, createBackend());
    await page.goto("./");
    await page.getByRole("link", { name: "Impressum" }).click();
    await expect(page.getByRole("heading", { name: "Impressum" })).toBeVisible();
    await expect(page.getByRole("note")).toContainText("noch nicht ausgefüllt");

    await page.goto("./?seite=datenschutz");
    await expect(page.getByRole("heading", { name: "Datenschutzerklärung" })).toBeVisible();
    await expect(page.locator("main")).toContainText("OpenStreetMap Foundation");
    await page.getByRole("link", { name: "Zu nodi" }).click();
    await expect(page.getByText("Willkommen zurück")).toBeVisible();
});
