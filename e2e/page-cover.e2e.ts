import { createBackend, page as fakePage } from "./fake-supabase";
import { expect, openApp, test } from "./test";

const NOTES = "b0000000-0000-4000-8000-000000000001";

// A 2×2 PNG in nodi-Indigo.
const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNkzPwPBkwMDP8ZGRgYAAAg8wLqIW2JjAAAAABJRU5ErkJggg==",
    "base64",
);

test("Titelbild: Farbverlauf wählen, Bild hochladen, entfernen", async ({ page, context }) => {
    const backend = createBackend({ pages: [fakePage(NOTES, "Notizen")] });
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Notizen", exact: true }).click();
    const notes = () => backend.pages.find((item) => item.id === NOTES) as { cover?: string | null } | undefined;

    await page.getByRole("button", { name: "Titelbild hinzufügen" }).click();
    await page.getByRole("menuitem", { name: "Farbverlauf Meer" }).click();
    const cover = page.getByRole("img", { name: "Titelbild" });
    await expect(cover).toHaveAttribute("style", /linear-gradient/);
    await expect.poll(() => notes()?.cover).toBe("gradient:ocean");

    // An image goes into the page's folder; the cover keeps the reference.
    await cover.hover();
    await page.getByRole("button", { name: "Titelbild ändern" }).click();
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("menuitem", { name: /Bild hochladen/ }).click();
    await (await chooser).setFiles({ name: "Strand.png", mimeType: "image/png", buffer: PNG });
    await expect.poll(() => notes()?.cover).toMatch(new RegExp(`^nodi-file:${NOTES}/[0-9a-f-]{36}-Strand\\.png$`));
    await expect(cover).toHaveAttribute("style", /url\("blob:/);

    // Still there after a reload (from the server).
    await page.reload();
    await page.getByRole("button", { name: "Notizen", exact: true }).click();
    await expect(cover).toHaveAttribute("style", /url\("blob:/);

    await cover.hover();
    await page.getByRole("button", { name: "Titelbild ändern" }).click();
    await page.getByRole("menuitem", { name: "Titelbild entfernen" }).click();
    await expect(cover).toHaveCount(0);
    await expect.poll(() => notes()?.cover).toBeNull();
});
