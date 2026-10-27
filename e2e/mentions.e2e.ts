import { MEMBER, createBackend, page as fakePage, sendMentionChange } from "./fake-supabase";
import { expect, openApp, test } from "./test";

const NOTES = "b0000000-0000-4000-8000-000000000001";
const PLAN = "b0000000-0000-4000-8000-000000000002";

test("„@“ erwähnt ein Mitglied des Workspace; die Erwähnung wird gespeichert", async ({ page, context }) => {
    const backend = createBackend({ pages: [fakePage(NOTES, "Notizen")] });
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Notizen", exact: true }).click();

    await page.locator(".bn-editor").first().click();
    await page.keyboard.type("Frage an @ki");
    // People come first; the user does not mention themselves.
    await expect(page.getByRole("option", { name: /kim@nodi\.test/ })).toBeVisible();
    await expect(page.getByRole("option", { name: /owner@nodi\.test/ })).toHaveCount(0);
    await page.keyboard.press("Enter");

    await expect(page.locator(".bn-editor .nodi-mention")).toHaveText("@kim");
    await expect
        .poll(() => JSON.stringify(backend.savedDocuments.get(NOTES) ?? null))
        .toContain(`"type":"mention","props":{"userId":"${MEMBER}","label":"kim@nodi.test"}`);
});

test("Erwähnungen: ungelesene in der Seitenleiste, Klick öffnet die Seite, live neue", async ({ page, context }) => {
    const backend = createBackend({
        pages: [fakePage(NOTES, "Notizen"), fakePage(PLAN, "Plan")],
        mentions: [
            {
                id: "m1",
                page_id: PLAN,
                workspace_id: "w1",
                page_title: "Plan",
                page_icon: null,
                mentioned_by_email: "kim@nodi.test",
                mentioned_at: "2026-10-26T09:00:00Z",
                read_at: null,
            },
        ],
    });
    await openApp(page, context, backend);
    const button = page.getByRole("button", { name: /Erwähnungen/ });
    await expect(button).toContainText("1 ungelesen");

    await button.click();
    const dialog = page.getByRole("dialog", { name: "Erwähnungen" });
    await expect(dialog).toContainText("kim@nodi.test");
    await dialog.getByRole("button", { name: /Plan/ }).click();
    await expect(page.getByRole("navigation", { name: "Pfad" })).toHaveText("Plan");
    await expect.poll(() => backend.mentions[0].read_at).not.toBeNull();
    await expect(button).not.toContainText("ungelesen");

    // A new mention arrives live.
    await expect.poll(() => backend.realtimeChannels.length).toBeGreaterThan(0);
    backend.mentions.unshift({
        ...backend.mentions[0],
        id: "m2",
        page_id: NOTES,
        page_title: "Notizen",
        read_at: null,
    });
    sendMentionChange(backend);
    await expect(button).toContainText("1 ungelesen");

    await button.click();
    await dialog.getByRole("button", { name: "Alle als gelesen markieren" }).click();
    await expect(button).not.toContainText("ungelesen");
    expect(backend.mentions.every((mention) => mention.read_at !== null)).toBe(true);
});
