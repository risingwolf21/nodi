import { createBackend, page as fakePage, taskDatabase } from "./fake-supabase";
import { expect, openApp, test } from "./test";

const NOTES = "b0000000-0000-4000-8000-000000000001";

// The page head like Notion (package 45a).
test("Titel, Überschriften und Titelbild haben Notions Maße", async ({ page, context }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const backend = createBackend({
        pages: [fakePage(NOTES, "Notizen", { icon: "📝", cover: "gradient:ocean" })],
    });
    backend.savedDocuments.set(NOTES, [
        {
            id: "h1",
            type: "heading",
            props: { level: 1 },
            content: [{ type: "text", text: "Ziele", styles: {} }],
            children: [],
        },
        {
            id: "h2",
            type: "heading",
            props: { level: 2 },
            content: [{ type: "text", text: "Aufgaben", styles: {} }],
            children: [],
        },
    ]);
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Notizen", exact: true }).click();

    await expect(page.getByRole("textbox", { name: "Seitentitel" })).toHaveCSS("font-size", "40px");
    await expect(page.getByRole("heading", { name: "Ziele", level: 1 })).toHaveCSS("font-size", "30px");
    await expect(page.getByRole("heading", { name: "Aufgaben", level: 2 })).toHaveCSS("font-size", "24px");

    // The cover spans the page from the top bar on; the icon reaches into it.
    const cover = await page.getByRole("img", { name: "Titelbild" }).boundingBox();
    const scroll = await page.locator(".nodi-page-scroll").boundingBox();
    const icon = await page.getByRole("button", { name: "Icon ändern" }).boundingBox();
    expect(cover && scroll && icon).toBeTruthy();
    if (!cover || !scroll || !icon) return;
    expect(cover.x).toBe(scroll.x);
    expect(cover.width).toBe(scroll.width);
    expect(cover.y).toBe(scroll.y);
    expect(icon.y).toBeLessThan(cover.y + cover.height);
    expect(icon.y + icon.height).toBeGreaterThan(cover.y + cover.height);

    // No comment button under the title until one is written.
    await expect(page.getByRole("region", { name: "Kommentare" })).toHaveCount(0);
    await page.getByRole("button", { name: "Kommentar hinzufügen" }).click();
    await expect(
        page.getByRole("region", { name: "Kommentare" }).getByLabel("Kommentar", { exact: true }),
    ).toBeFocused();
});

// Database pages like Notion (package 45b): the whole width, and the "Neu" row as wide as the table.
test("Eine Datenbank nutzt die ganze Breite; „Neu“ ist so breit wie die Tabelle", async ({ page, context }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const backend = taskDatabase({
        properties: ["Eins", "Zwei", "Drei", "Vier", "Fünf", "Sechs"].map((name, index) => ({
            id: `p${index}`,
            databaseId: "db",
            name,
            type: "text",
            options: {},
            position: index,
        })),
    });
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Aufgaben", exact: true }).click();
    await page.getByRole("table").waitFor();

    const scroll = await page.locator(".nodi-page-scroll").boundingBox();
    const title = await page.getByRole("textbox", { name: "Seitentitel" }).boundingBox();
    expect(scroll && title).toBeTruthy();
    if (!scroll || !title) return;
    expect(title.x - scroll.x).toBe(54);
    expect(title.width).toBe(scroll.width - 2 * 54);

    const table = await page.getByRole("table").boundingBox();
    const newRow = await page.getByRole("button", { name: "Neu", exact: true }).boundingBox();
    expect(table && newRow).toBeTruthy();
    if (!table || !newRow) return;
    expect(newRow.x).toBe(table.x);
    expect(newRow.width).toBe(table.width);
    await expect(page.getByRole("button", { name: "Seitenmenü" })).toBeVisible();
    await page.getByRole("button", { name: "Seitenmenü" }).click();
    await expect(page.getByRole("menuitem", { name: "Volle Breite" })).toHaveCount(0);
});

// Editor details like Notion (package 45c).
test("Slash-Menü, Codeblock und Checkboxen sehen aus wie in Notion", async ({ page, context }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const backend = createBackend({ pages: [fakePage(NOTES, "Notizen")] });
    backend.savedDocuments.set(NOTES, [
        {
            id: "todo",
            type: "checkListItem",
            props: { checked: true },
            content: [{ type: "text", text: "Erledigt", styles: {} }],
            children: [],
        },
        {
            id: "code",
            type: "codeBlock",
            props: { language: "text" },
            content: [{ type: "text", text: "const a = 1;", styles: {} }],
            children: [],
        },
        { id: "empty", type: "paragraph", props: {}, content: [], children: [] },
    ]);
    await openApp(page, context, backend);
    await page.getByRole("button", { name: "Notizen", exact: true }).click();

    const editor = page.locator(".bn-editor");
    const checkbox = editor.locator('[data-content-type="checkListItem"] input');
    await expect(checkbox).toHaveCSS("width", "16px");
    await expect(checkbox).toHaveCSS("height", "16px");
    const code = editor.locator('[data-content-type="codeBlock"]');
    const muted = await page.evaluate(() => {
        const probe = document.createElement("div");
        probe.style.backgroundColor = "var(--muted)";
        document.body.append(probe);
        const colour = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return colour;
    });
    await expect(code).toHaveCSS("background-color", muted);

    // Compact rows without descriptions; our blocks among the basic ones; German shortcuts.
    await editor.locator('[data-id="empty"] .bn-inline-content').click();
    await page.keyboard.type("/");
    const heading = page.getByRole("option", { name: /Überschrift 1/ }).first();
    await expect(heading).toContainText("Strg+Alt+1");
    await expect(heading).not.toContainText("Hauptebene");
    const box = await heading.boundingBox();
    expect(box?.height).toBeLessThan(40);
    const names = await page
        .getByRole("option")
        .evaluateAll((options) =>
            options.map((option) => option.querySelector(".bn-mt-suggestion-menu-item-title")?.textContent),
        );
    // BlockNote's basic blocks end with "Trennlinie", its advanced ones start with "Tabelle".
    expect(names.slice(names.indexOf("Trennlinie") + 1, names.indexOf("Tabelle"))).toEqual([
        "Callout",
        "2 Spalten",
        "3 Spalten",
    ]);
    expect(names.at(-1)).toBe("Datenbank");
});

// The arrow takes the icon's place on hover, like Notion (package 45c).
test("In der Seitenleiste erscheint der Pfeil beim Überfahren anstelle des Icons", async ({ page, context }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const backend = createBackend({
        pages: [fakePage(NOTES, "Notizen"), fakePage("child", "Unterseite", { parent_id: NOTES })],
    });
    await openApp(page, context, backend);

    const row = page.getByRole("button", { name: "Notizen", exact: true });
    const arrow = page.getByRole("button", { name: "Unterseiten einklappen" });
    await expect(arrow).toHaveCSS("opacity", "0");
    await row.hover();
    await expect(arrow).toHaveCSS("opacity", "1");
    const arrowBox = await arrow.boundingBox();
    const iconBox = await row.locator("span").first().boundingBox();
    expect(arrowBox?.x).toBe(iconBox?.x);
    // A page without children shows no arrow; the top-level icon lines up with "Suchen".
    await expect(page.getByRole("button", { name: "Unterseiten ausklappen" })).toBeHidden();
    const search = await page
        .getByRole("button", { name: /Suchen/ })
        .locator("svg")
        .boundingBox();
    expect(iconBox && search && Math.abs(iconBox.x + iconBox.width / 2 - (search.x + search.width / 2))).toBeLessThan(
        3,
    );

    await arrow.click();
    await expect(page.getByRole("button", { name: "Unterseite", exact: true })).toBeHidden();
});

test.describe("Telefon", () => {
    test.use({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true });

    test("Die Ansichten einer Datenbank stehen in einer Zeile und scrollen seitlich", async ({ page, context }) => {
        const backend = taskDatabase({
            views: ["Tabelle", "Board", "Liste", "Kalender", "Galerie", "Zeitleiste"].map((name, index) => ({
                id: `v${index}`,
                databaseId: "db",
                name,
                type: (["table", "board", "list", "calendar", "gallery", "timeline"] as const)[index],
                config: {},
                position: index,
            })),
        });
        await openApp(page, context, backend);
        await page.getByRole("button", { name: "Aufgaben", exact: true }).tap();

        const tabs = page.getByRole("tablist", { name: "Ansichten" }).getByRole("tab");
        await expect(tabs).toHaveCount(6);
        const tops = await tabs.evaluateAll((items) => items.map((item) => item.getBoundingClientRect().top));
        expect(new Set(tops).size).toBe(1);
        const strip = page.locator(".nodi-scroll-x");
        expect(await strip.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);

        // The menu of a tab is not clipped by the scrolling strip.
        await tabs.first().tap();
        await expect(page.getByRole("textbox", { name: "Name der Ansicht" })).toBeVisible();
        await expect(page.getByRole("menuitem", { name: "Ansicht löschen" })).toBeInViewport();
    });
});
