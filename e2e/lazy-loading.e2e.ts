import { STATUS_OPTIONS, page as fakePage, taskDatabase, type FakeBackend } from "./fake-supabase";
import { expect, openApp, test } from "./test";

function database(): FakeBackend {
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
    });
    backend.pages.push(fakePage("pa", "Notizen"));
    return backend;
}

const chunkName = (url: string) => new URL(url).pathname.split("/").pop() ?? "";

test("Die Datenbank-Oberfläche wird erst mit der ersten Datenbank geladen", async ({ page, context }) => {
    const loaded: string[] = [];
    page.on("request", (request) => loaded.push(chunkName(request.url())));
    await openApp(page, context, database());
    await expect(page.getByRole("button", { name: "Notizen", exact: true })).toBeVisible();
    expect(loaded.filter((name) => /^(DatabaseView|PropertyBar)-/.test(name))).toEqual([]);

    await page.getByRole("button", { name: "Aufgaben", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Tabelle" })).toBeVisible();
    expect(loaded.some((name) => name.startsWith("DatabaseView-"))).toBe(true);
});

test("Lässt sich die Datenbank nicht laden, bleiben Hinweis, Titel und Navigation", async ({ page, context }) => {
    await context.route(/\/assets\/(DatabaseView|PropertyValueEditor)-.*\.js$/, (route) =>
        route.abort("internetdisconnected"),
    );
    await openApp(page, context, database());

    await page.getByRole("button", { name: "Aufgaben", exact: true }).click();
    await expect(page.getByRole("alert").first()).toContainText("Die Datenbank konnte nicht geladen werden.");
    await expect(page.getByRole("button", { name: "Neu laden" })).toBeVisible();
    await expect(page.getByLabel("Seitentitel")).toHaveValue("Aufgaben");

    await page.getByRole("button", { name: "Notizen", exact: true }).click();
    await expect(page.getByLabel("Seitentitel")).toHaveValue("Notizen");
});

test("Lassen sich nur die Eigenschaften nicht laden, öffnet der Eintrag trotzdem mit Editor", async ({
    page,
    context,
}) => {
    await context.route(/\/assets\/PropertyBar-.*\.js$/, (route) => route.abort("internetdisconnected"));
    await openApp(page, context, database());

    await page.getByRole("button", { name: "Aufgaben", exact: true }).click();
    await page.locator("table").getByRole("button", { name: "Bericht öffnen" }).click();
    await expect(page.getByRole("alert").first()).toContainText("Die Eigenschaften konnten nicht geladen werden.");
    await expect(page.locator(".bn-editor")).toBeVisible();
});
