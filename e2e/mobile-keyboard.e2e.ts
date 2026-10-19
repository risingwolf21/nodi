import { createBackend, page as fakePage } from "./fake-supabase";
import { expect, openApp, test } from "./test";

// An iPhone-sized touch screen. Headless Chromium has no on-screen keyboard:
// a stand-in for `visualViewport` shrinks like iOS does when it opens.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const FULL_HEIGHT = 844;
const WITH_KEYBOARD = 500;

test("Auf dem Handy passt die Seite über die Tastatur; die Formatierungsleiste nur bei markiertem Text", async ({
    page,
    context,
}) => {
    await context.addInitScript(
        ({ full, withKeyboard }) => {
            const events = new EventTarget();
            const state = { width: 390, height: full, offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1 };
            const viewport = new Proxy(events, {
                get: (target, key) => {
                    if (typeof key === "string" && key in state) return state[key as keyof typeof state];
                    const value: unknown = Reflect.get(target, key);
                    return typeof value === "function" ? value.bind(target) : value;
                },
            });
            Object.defineProperty(window, "visualViewport", { configurable: true, get: () => viewport });
            Object.assign(window, {
                setKeyboard: (open: boolean) => {
                    state.height = open ? withKeyboard : full;
                    events.dispatchEvent(new Event("resize"));
                },
            });
        },
        { full: FULL_HEIGHT, withKeyboard: WITH_KEYBOARD },
    );
    const setKeyboard = (open: boolean) =>
        page.evaluate(
            (value) => (window as unknown as { setKeyboard: (open: boolean) => void }).setKeyboard(value),
            open,
        );

    await openApp(
        page,
        context,
        createBackend({ pages: [fakePage("b0000000-0000-4000-8000-000000000001", "Notizen")] }),
    );
    await page.getByRole("button", { name: "Notizen", exact: true }).click();
    await page.locator(".bn-editor").first().click();
    await page.keyboard.type("Hallo Welt");
    await setKeyboard(true);

    // The app fits the visible area; the top bar makes room while typing.
    await expect(page.locator("html")).toHaveAttribute("data-keyboard-open", "");
    await expect.poll(async () => (await page.locator("main").boundingBox())?.height).toBe(WITH_KEYBOARD);
    await expect(page.getByRole("button", { name: "Seitenmenü" })).toBeHidden();

    // Typing: no toolbar. Selected text: the toolbar sits right above the keyboard.
    const toolbar = page.locator(".bn-mobile-formatting-toolbar");
    await expect(toolbar).toHaveCount(0);
    await page.keyboard.press("Shift+Home");
    await expect(toolbar).toBeVisible();
    await expect
        .poll(async () => {
            const box = await toolbar.boundingBox();
            return box ? Math.round(box.y + box.height) : null;
        })
        .toBe(WITH_KEYBOARD);
    await page.keyboard.press("End");
    await expect(toolbar).toHaveCount(0);

    await setKeyboard(false);
    await expect(page.getByRole("button", { name: "Seitenmenü" })).toBeVisible();
    await expect.poll(async () => (await page.locator("main").boundingBox())?.height).toBe(FULL_HEIGHT);
});
