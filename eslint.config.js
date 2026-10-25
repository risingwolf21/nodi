import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
    // supabase/functions runs on Deno (Edge Functions), outside the app's tsconfig.
    globalIgnores(["dist", "dist-e2e", "test-results", "playwright-report", "supabase/functions"]),
    {
        files: ["**/*.{ts,tsx}"],
        extends: [
            js.configs.recommended,
            tseslint.configs.recommended,
            reactHooks.configs.flat.recommended,
            reactRefresh.configs.vite,
        ],
        languageOptions: {
            globals: globals.browser,
            // Type information for the promise rules below.
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        // A forgotten await or an unhandled rejection loses errors silently;
        // in the offline sync that means changes that never reach the server.
        rules: {
            "@typescript-eslint/no-floating-promises": "error",
            "@typescript-eslint/no-misused-promises": "error",
            "@typescript-eslint/await-thenable": "error",
        },
    },
]);
