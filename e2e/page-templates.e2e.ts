import { createBackend, page as fakePage } from "./fake-supabase";
import { expect, openApp, test } from "./test";

// A 2×2 PNG in nodi-Indigo.
const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNkzPwPBkwMDP8ZGRgYAAAg8wLqIW2JjAAAAABJRU5ErkJggg==",
    "base64",
);
const TEMPLATE = "70000000-0000-4000-8000-000000000001";
const NOTES = "b0000000-0000-4000-8000-000000000001";
const IMAGE = `${TEMPLATE}/80000000-0000-4000-8000-000000000001-Plan.png`;

test("Seitenvorlagen: eine neue Seite beginnt mit Text, Bild, Titel, Icon und Titelbild der Vorlage", async ({
    page,
    context,
}) => {
    const backend = createBackend({
        pages: [
            fakePage(TEMPLATE, "Protokoll", { is_template: true, icon: "📝", cover: "gradient:sunset" }),
            fakePage(NOTES, "Notizen"),
        ],
        files: new Map([[IMAGE, PNG]]),
        savedDocuments: new Map([
            [
                TEMPLATE,
                [
                    {
                        id: "h1",
                        type: "heading",
                        props: { level: 2 },
                        content: [{ type: "text", text: "Agenda", styles: {} }],
                    },
                    { id: "i1", type: "image", props: { url: `nodi-file:${IMAGE}` } },
                ],
            ],
        ]),
    });
    await openApp(page, context, backend);

    // The template is marked in the sidebar.
    await expect(page.getByRole("button", { name: "Protokoll Vorlage" })).toBeVisible();

    // A new, empty page offers the template.
    await page.getByRole("complementary").getByRole("button", { name: "Neue Seite", exact: true }).click();
    const choices = page.getByRole("region", { name: "Vorlagen" });
    await choices.getByRole("button", { name: "Protokoll" }).click();

    const editor = page.locator(".bn-editor");
    await expect(editor.getByRole("heading", { name: "Agenda" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Seitentitel" })).toHaveValue("Protokoll");
    await expect(choices).toHaveCount(0);

    // Title, icon and cover went to the page; the image is a copy in its folder.
    const created = backend.pages.find((item) => item.id !== TEMPLATE && item.id !== NOTES);
    expect(created).toBeDefined();
    const pageId = created?.id ?? "";
    await expect.poll(() => created?.icon).toBe("📝");
    expect(created).toMatchObject({ title: "Protokoll", cover: "gradient:sunset" });
    const copies = [...backend.files.keys()].filter((path) => path.startsWith(`${pageId}/`));
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatch(/-Plan\.png$/);
    await expect
        .poll(() => JSON.stringify(backend.savedDocuments.get(pageId) ?? null))
        .toContain(`nodi-file:${copies[0]}`);
    expect(JSON.stringify(backend.savedDocuments.get(pageId))).not.toContain('"h1"');

    // Any page can become a template, from the page menu.
    await page.getByRole("button", { name: "Notizen", exact: true }).click();
    await page.getByRole("button", { name: "Seitenmenü" }).click();
    await page.getByRole("menuitem", { name: "Als Vorlage verwenden" }).click();
    await expect.poll(() => backend.pages.find((item) => item.id === NOTES)?.is_template).toBe(true);
    await expect(page.getByRole("note")).toContainText("Vorlage: Neue, leere Seiten");
});
