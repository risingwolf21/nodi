import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";
import { installFakeSupabase, signIn, type FakeBackend } from "./fake-supabase";

/** Every test fails on an uncaught error in the page. */
export const test = base.extend<{ pageErrors: string[] }>({
    pageErrors: [
        async ({ page }, use) => {
            const errors: string[] = [];
            page.on("pageerror", (error) => errors.push(String(error)));
            await use(errors);
            expect(errors).toEqual([]);
        },
        { auto: true },
    ],
});

export { expect };

/** Opens the app against the fake backend; signed in unless stated otherwise. */
export async function openApp(
    page: Page,
    context: BrowserContext,
    backend: FakeBackend,
    { signedIn = true, path = "./" } = {},
): Promise<void> {
    await installFakeSupabase(context, backend);
    if (signedIn) await signIn(context);
    await page.goto(path);
}
