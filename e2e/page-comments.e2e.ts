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

test("Kommentar an einer Textstelle: markieren, kommentieren, anspringen, erledigen", async ({ page, context }) => {
    const backend = createBackend({ pages: [fakePage(NOTES, "Notizen")] });
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Notizen", exact: true }).click();
    const editor = page.locator(".bn-editor");
    const comments = page.getByRole("region", { name: "Kommentare" });

    await editor.click();
    await page.keyboard.type("Freitag");
    await editor.getByText("Freitag").dblclick();
    await page.getByRole("button", { name: "Kommentieren" }).click();

    // The first comment is asked for under the title, with the quoted text.
    await expect(comments.locator("blockquote")).toHaveText("Freitag");
    await comments.getByLabel("Kommentar zum Text").fill("Oder Donnerstag?");
    await comments.getByRole("button", { name: "Kommentieren" }).click();
    const thread = comments.getByRole("article", { name: "Kommentar von owner@nodi.test" });
    await expect(thread).toContainText("Oder Donnerstag?");
    const [stored] = backend.comments;
    expect(stored.quote).toBe("Freitag");

    // The text keeps the thread's id as its mark; an open thread highlights it.
    const mark = editor.locator(`.nodi-comment-mark[data-thread-id="${stored.id}"]`);
    await expect(mark).toBeVisible();
    await expect
        .poll(() => JSON.stringify(backend.savedDocuments.get(NOTES) ?? null))
        .toContain(`"comment":"${stored.id}"`);
    await mark.click();
    await expect(thread).toHaveClass(/ring-2/);

    // Resolved: the mark stays in the text, but is not highlighted.
    await thread.getByRole("button", { name: "Erledigt" }).click();
    await expect(mark).toHaveCount(0);
});

test("Ein nicht abgeschickter Kommentar an einer Textstelle hinterlässt keine Markierung", async ({
    page,
    context,
}) => {
    const backend = createBackend({ pages: [fakePage(NOTES, "Notizen")] });
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Notizen", exact: true }).click();
    const editor = page.locator(".bn-editor");

    await editor.click();
    await page.keyboard.type("Nur ein Entwurf");
    await editor.getByText("Nur ein Entwurf").dblclick();
    await page.getByRole("button", { name: "Kommentieren" }).click();
    await page.getByRole("region", { name: "Kommentare" }).getByRole("button", { name: "Abbrechen" }).click();

    await expect.poll(() => JSON.stringify(backend.savedDocuments.get(NOTES) ?? null)).toContain("Nur ein Entwurf");
    expect(JSON.stringify(backend.savedDocuments.get(NOTES))).not.toContain('"comment"');
    expect(backend.comments).toEqual([]);
});
