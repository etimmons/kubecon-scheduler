import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { VitePWA } from "vite-plugin-pwa";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig({
  root: "app",
  base: "./",
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
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
        name: "KubeCon Scheduler",
        short_name: "KubeCon",
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
        // vite-plugin-pwa only sets these for registerType "autoUpdate" when it injects its own
        // register script. With injectRegister: false they must be explicit, or a new version
        // waits until every window of the installed app is closed (on iOS: effectively never).
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
});
