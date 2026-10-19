import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

// Browser tests against a production build with a fake Supabase backend
// (e2e/fake-supabase.ts): no real server, no secrets.
export default defineConfig({
    testDir: "./e2e",
    testMatch: "**/*.e2e.ts",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    // No retries: a flaky test is a bug to fix, not to hide.
    retries: 0,
    reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
    use: {
        baseURL: `http://localhost:${PORT}/nodi/`,
        // The service worker would answer requests the tests fake.
        serviceWorkers: "block",
        trace: "retain-on-failure",
        // A preinstalled Chromium of another Playwright version (cloud sessions).
        launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined },
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
    webServer: {
        command: `vite build --outDir dist-e2e && vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
        url: `http://localhost:${PORT}/nodi/`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
            VITE_SUPABASE_URL: "http://fake.localhost:54321",
            VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_e2e",
        },
    },
});
