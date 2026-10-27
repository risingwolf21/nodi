import { taskDatabase } from "./fake-supabase";
import { expect, openApp, test } from "./test";

// A 2×2 PNG in nodi-Indigo.
const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNkzPwPBkwMDP8ZGRgYAAAg8wLqIW2JjAAAAABJRU5ErkJggg==",
    "base64",
);
const IMAGE = "e2000000-0000-4000-8000-000000000002/80000000-0000-4000-8000-000000000001-foto.png";

test("Galerie: Karten zeigen das Titelbild oder das erste Bild des Eintrags", async ({ page, context }) => {
    const backend = taskDatabase({
        views: [{ id: "v1", databaseId: "db", name: "Galerie", type: "gallery", config: {}, position: 1 }],
        files: new Map([[IMAGE, PNG]]),
        previews: [
            {
                pageId: "e2",
                updatedAt: "2026-10-05T10:00:00Z",
                block0: { type: "paragraph", content: [{ type: "text", text: "Entwurf", styles: {} }] },
                block1: { type: "image", props: { url: `nodi-file:${IMAGE}` } },
                block2: null,
                pages: { parent_id: "db" },
            },
        ],
    });
    const report = backend.pages.find((item) => item.id === "e1");
    if (report) report.cover = "gradient:ocean";
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Aufgaben", exact: true }).click();

    // Bericht has a gradient cover, Angebot an image in its text.
    const card = (name: string) => page.getByRole("button", { name, exact: false }).filter({ hasText: name });
    await expect(card("Bericht").locator("span[style*='linear-gradient']")).toHaveCount(1);
    const image = card("Angebot").locator("img");
    await expect(image).toHaveAttribute("src", /^blob:/);
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(2);
});
