import type { Page } from "@playwright/test";
import { createBackend, page as fakePage } from "./fake-supabase";
import { expect, openApp, test } from "./test";

// iOS draws no blur over the top edge when WebKit finds a fixed box there
// (LocalFrameView::fixedContainerEdges). Chromium cannot show the blur, so
// this checks the strip against WebKit's rules and the colour it reports.
async function topEdge(page: Page) {
    return page.evaluate(() => {
        // Like WebKit's hit test: 4 px below the middle of the top edge, pointer-events ignored.
        const x = window.innerWidth / 2;
        const strip = [...document.querySelectorAll<HTMLElement>("*")]
            .filter((element) => {
                const style = getComputedStyle(element);
                const box = element.getBoundingClientRect();
                return (
                    (style.position === "fixed" || style.position === "sticky") &&
                    box.left <= x &&
                    box.right >= x &&
                    box.top <= 4 &&
                    box.bottom > 4
                );
            })
            .sort((a, b) => Number(getComputedStyle(b).zIndex) - Number(getComputedStyle(a).zIndex))[0];
        if (!strip) return null;
        const box = strip.getBoundingClientRect();
        const style = getComputedStyle(strip);
        return {
            wideEnough: box.width >= window.innerWidth * 0.9,
            height: box.height,
            color: style.backgroundColor,
            paintsColour: style.backgroundClip !== "text",
        };
    });
}

const colourOf = (page: Page, selector: string) =>
    page
        .locator(selector)
        .first()
        .evaluate((element) => getComputedStyle(element).backgroundColor);

test.describe("Telefon", () => {
    test.use({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true });

    test("Oben liegt ein fester Streifen in der Farbe der Seitenliste bzw. der Seite", async ({ page, context }) => {
        const backend = createBackend({ pages: [fakePage("a", "Alpha")] });
        await openApp(page, context, backend);

        const sidebarColour = await colourOf(page, ".bg-sidebar");
        await expect
            .poll(() => topEdge(page))
            .toEqual({
                wideEnough: true,
                height: 12,
                color: sidebarColour,
                paintsColour: false,
            });

        await page.getByRole("button", { name: "Alpha", exact: true }).tap();
        await expect(page.getByRole("textbox", { name: "Seitentitel" })).toHaveValue("Alpha");
        const pageColour = await colourOf(page, "main.nodi-app-viewport");
        expect(pageColour).not.toBe(sidebarColour);
        await expect.poll(async () => (await topEdge(page))?.color).toBe(pageColour);
    });
});
