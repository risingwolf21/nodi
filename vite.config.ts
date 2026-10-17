import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "/nodi/",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // A new service worker only takes over after the user confirms
      // (UpdatePrompt), so an open editor is never reloaded unasked.
      registerType: "prompt",
      injectRegister: false,
      // Icons and favicon are already precached via workbox.globPatterns.
      includeManifestIcons: false,
      manifest: {
        id: "/nodi/",
        name: "nodi",
        short_name: "nodi",
        description: "Deine Ideen. Überall.",
        lang: "de",
        start_url: "/nodi/",
        scope: "/nodi/",
        display: "standalone",
        background_color: "#0B0F14",
        theme_color: "#6366F1",
        // Relative to the manifest URL (/nodi/manifest.webmanifest).
        icons: [
          { src: "icons/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/pwa-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Only the static app shell is precached. Supabase requests are
        // cross-origin and not handled by the service worker, so no
        // authenticated API response ends up in a cache.
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
