import { createBackend, page as fakePage } from "./fake-supabase";
import { expect, openApp, test } from "./test";

const NOTES = "b0000000-0000-4000-8000-000000000001";
const CHILD = "b0000000-0000-4000-8000-000000000002";
const LATER = "b0000000-0000-4000-8000-000000000003";
const IMAGE = `${NOTES}/c0000000-0000-4000-8000-000000000001-bild.png`;
// A 1×1 PNG.
const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
);

function backendWithNotes() {
    const backend = createBackend({
        pages: [
            fakePage(NOTES, "Notizen", { position: 1 }),
            fakePage(CHILD, "Unterseite", { parent_id: NOTES }),
            fakePage(LATER, "Danach", { position: 2 }),
        ],
    });
    backend.savedDocuments.set(NOTES, [
        {
            id: "p1",
            type: "paragraph",
            props: {},
            content: [
                { type: "text", text: "Siehe ", styles: {} },
                { type: "pageLink", props: { pageId: CHILD, title: "Unterseite" } },
            ],
            children: [],
        },
        { id: "i1", type: "image", props: { url: `nodi-file:${IMAGE}`, name: "bild.png" }, children: [] },
    ]);
    backend.files.set(IMAGE, PNG);
    return backend;
}

// Duplicating like Notion (package 47): the page with its subpages, right after it.
test("„Duplizieren“ kopiert die Seite mit Unterseiten, Text und Bild und öffnet die Kopie", async ({
    page,
    context,
}) => {
    const backend = backendWithNotes();
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Notizen", exact: true }).click();
    await page.getByRole("button", { name: "Seitenmenü" }).click();
    await page.getByRole("menuitem", { name: "Duplizieren" }).click();

    await expect(page.getByRole("textbox", { name: "Seitentitel" })).toHaveValue("Notizen (Kopie)");
    const copy = backend.pages.find((item) => item.title === "Notizen (Kopie)");
    expect(copy?.position).toBe(1.5);
    if (!copy) return;
    await expect(page).toHaveURL(new RegExp(`\\?id=${copy.id}$`));

    // In the tree between the original and the next page, with its subpage.
    const tree = page.getByRole("navigation", { name: "Seiten" });
    await expect(tree.getByRole("button", { name: /^(Notizen|Notizen \(Kopie\)|Danach)$/ })).toHaveText([
        "Notizen",
        "Notizen (Kopie)",
        "Danach",
    ]);
    await expect(tree.getByRole("button", { name: "Unterseite", exact: true })).toHaveCount(2);

    // The text links to the copied subpage; the image was copied into the copy's folder.
    const childCopy = backend.pages.find((item) => item.title === "Unterseite" && item.parent_id === copy.id);
    expect(childCopy).toBeTruthy();
    await expect(page.locator(".bn-editor")).toContainText("Siehe");
    expect(JSON.stringify(backend.savedDocuments.get(copy.id))).toContain(childCopy?.id ?? "missing");
    expect(backend.files.has(IMAGE.replace(NOTES, copy.id))).toBe(true);
    await expect(page.getByRole("img", { name: "bild.png" })).toBeVisible();
});

test("Auch das Menü in der Seitenleiste dupliziert eine Seite", async ({ page, context }) => {
    const backend = backendWithNotes();
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Aktionen für Danach" }).click();
    await page.getByRole("menuitem", { name: "Duplizieren" }).click();

    await expect(page.getByRole("textbox", { name: "Seitentitel" })).toHaveValue("Danach (Kopie)");
    expect(backend.pages.find((item) => item.title === "Danach (Kopie)")?.position).toBe(3);
});
