import { createBackend, page as fakePage } from "./fake-supabase";
import { expect, openApp, test } from "./test";

const NOTES = "b0000000-0000-4000-8000-000000000001";

test("Kommentare: schreiben, antworten, bearbeiten, erledigen, löschen", async ({ page, context }) => {
    const backend = createBackend({ pages: [fakePage(NOTES, "Notizen")] });
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Notizen", exact: true }).click();
    const comments = page.getByRole("region", { name: "Kommentare" });

    await comments.getByRole("button", { name: "Kommentar hinzufügen" }).click();
    await comments.getByLabel("Kommentar", { exact: true }).fill("Termin klären?");
    await comments.getByRole("button", { name: "Kommentieren" }).click();
    const thread = comments.getByRole("article", { name: "Kommentar von owner@nodi.test" });
    await expect(thread).toContainText("Termin klären?");
    expect(backend.comments.map(({ page_id, body }) => [page_id, body])).toEqual([[NOTES, "Termin klären?"]]);

    // Ctrl+Enter sends a reply.
    await thread.getByRole("button", { name: "Antworten" }).click();
    await thread.getByLabel("Antwort").fill("Freitag passt.");
    await thread.getByLabel("Antwort").press("Control+Enter");
    await expect(thread).toContainText("Freitag passt.");
    expect(backend.comments[1].parent_id).toBe(backend.comments[0].id);

    await thread.getByRole("button", { name: "Bearbeiten" }).first().click();
    await thread.getByLabel("Kommentar bearbeiten").fill("Termin am Freitag?");
    await thread.getByRole("button", { name: "Speichern" }).click();
    await expect(thread).toContainText("Termin am Freitag?");
    await expect(thread).toContainText("(bearbeitet)");

    // Resolved threads move under "Erledigte Kommentare".
    await thread.getByRole("button", { name: "Erledigt" }).click();
    await expect(thread).toHaveCount(0);
    await comments.getByRole("button", { name: "Erledigte Kommentare (1)" }).click();
    await thread.getByRole("button", { name: "Wieder öffnen" }).click();
    await expect(comments.getByRole("button", { name: /Erledigte Kommentare/ })).toHaveCount(0);

    // Deleting a thread asks once and takes the replies with it.
    await thread.getByRole("button", { name: "Löschen" }).first().click();
    await thread.getByRole("button", { name: "Mit allen Antworten löschen" }).click();
    await expect(thread).toHaveCount(0);
    expect(backend.comments).toEqual([]);
});
