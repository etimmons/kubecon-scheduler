import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  root: "app",
  base: "./",
  oxc: { jsx: { runtime: "automatic", importSource: "preact" } },
  build: { outDir: "../dist/app", emptyOutDir: true, target: "es2022" },
  server: {
    proxy: { "/api": "http://localhost:8080", "/sync": "http://localhost:8080" },
  },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "spellbook: KubeCon schedule",
        short_name: "spellbook",
        description: "KubeCon schedule with combined filters, a starred agenda and offline use.",
        start_url: "./",
        scope: "./",
        display: "standalone",
        background_color: "#141417",
        theme_color: "#141417",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Shell is precached. schedule.json is managed by the app in Cache Storage
        // (stale-while-revalidate); /api and /sync always go to the network.
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
        globIgnores: ["schedule.json"],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/sync\//, /schedule\.json$/],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
