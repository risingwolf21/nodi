import { createBackend, page as fakePage, sendPageActivity, taskDatabase } from "./fake-supabase";
import { expect, openApp, test } from "./test";

const NOTES = "b0000000-0000-4000-8000-000000000001";
const LATER = "b0000000-0000-4000-8000-000000000002";

const paragraph = (value: string) => ({
    id: crypto.randomUUID(),
    type: "paragraph",
    props: {},
    content: [{ type: "text", text: value, styles: {} }],
    children: [],
});

test("Änderungen von einem anderen Gerät erscheinen live: Seitenbaum, Text und Kommentare", async ({
    page,
    context,
}) => {
    const backend = createBackend({
        pages: [fakePage(NOTES, "Notizen")],
        savedDocuments: new Map([[NOTES, [paragraph("Erster Stand")]]]),
    });
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Notizen", exact: true }).click();
    await expect(page.getByText("Erster Stand")).toBeVisible();
    await expect.poll(() => backend.realtimeChannels.length).toBeGreaterThan(0);

    // A page created on another device appears in the tree.
    backend.pages.push(fakePage(LATER, "Von unterwegs"));
    sendPageActivity(backend, { page_id: LATER, change: "page" });
    await expect(page.getByRole("button", { name: "Von unterwegs", exact: true })).toBeVisible();

    // The open page shows text saved elsewhere.
    const otherMutation = crypto.randomUUID();
    backend.savedDocuments.set(NOTES, [paragraph("Neuer Stand vom Handy")]);
    backend.documentVersions.set(NOTES, { editedAt: new Date().toISOString(), mutationId: otherMutation });
    sendPageActivity(backend, { page_id: NOTES, change: "document", mutation_id: otherMutation });
    await expect(page.getByText("Neuer Stand vom Handy")).toBeVisible();
    await expect(page.getByText("Erster Stand")).toHaveCount(0);

    // The same change again (our copy holds that mutation) loads nothing.
    const fetches = backend.documentFetches.get(NOTES);
    sendPageActivity(backend, { page_id: NOTES, change: "document", mutation_id: otherMutation });
    await page.waitForTimeout(1500);
    expect(backend.documentFetches.get(NOTES)).toBe(fetches);

    // A comment written elsewhere.
    backend.comments.push({
        id: crypto.randomUUID(),
        page_id: NOTES,
        parent_id: null,
        author_id: "anna",
        author_email: "anna@nodi.test",
        body: "Schon gesehen?",
        quote: null,
        created_at: new Date().toISOString(),
        edited_at: null,
        resolved_at: null,
    });
    sendPageActivity(backend, { page_id: NOTES, change: "comments" });
    await expect(page.getByRole("region", { name: "Kommentare" })).toContainText("Schon gesehen?");
});

test("Während getippt wird, überschreibt eine Änderung von woanders den Text nicht", async ({ page, context }) => {
    const backend = createBackend({
        pages: [fakePage(NOTES, "Notizen")],
        savedDocuments: new Map([[NOTES, [paragraph("Erster Stand")]]]),
    });
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Notizen", exact: true }).click();
    await expect.poll(() => backend.realtimeChannels.length).toBeGreaterThan(0);

    await page.getByText("Erster Stand").click();
    await page.keyboard.press("End");
    await page.keyboard.type(" und mehr");
    const otherMutation = crypto.randomUUID();
    backend.savedDocuments.set(NOTES, [paragraph("Vom Handy")]);
    // Older than the typing: last write wins, the typing stays.
    backend.documentVersions.set(NOTES, { editedAt: "2026-02-01T00:00:00Z", mutationId: otherMutation });
    sendPageActivity(backend, { page_id: NOTES, change: "document", mutation_id: otherMutation });
    await page.waitForTimeout(1500);
    await expect(page.getByText("Erster Stand und mehr")).toBeVisible();
    await expect(page.getByText("Vom Handy")).toHaveCount(0);
});

test("Werte einer Datenbank, die woanders geändert werden, erscheinen live", async ({ page, context }) => {
    const backend = taskDatabase({
        properties: [{ id: "note", databaseId: "db", name: "Notiz", type: "text", options: {}, position: 1 }],
    });
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Aufgaben", exact: true }).click();
    const table = page.getByRole("table");
    await expect(table).toContainText("Bericht");
    await expect.poll(() => backend.realtimeChannels.length).toBeGreaterThan(0);

    backend.values.push({
        pageId: "e1",
        propertyId: "note",
        value: "Bis Freitag",
        updatedAt: new Date().toISOString(),
    });
    sendPageActivity(backend, { page_id: "db", change: "properties" });
    await expect(table).toContainText("Bis Freitag");
});
