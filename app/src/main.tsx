import { render } from "preact";
import { App } from "./components/App.tsx";
import { boot } from "./state/store.ts";
import "./styles.css";

if ("scrollRestoration" in history) history.scrollRestoration = "manual";

render(<App />, document.getElementById("app")!);
void boot();

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  void import("virtual:pwa-register").then(({ registerSW }) =>
    registerSW({
      immediate: true,
      // An installed app resumed from the background never navigates, so the browser never
      // re-checks sw.js. Check on every return to the foreground and every 30 min; with
      // autoUpdate the page reloads itself once the new version takes over.
      onRegisteredSW(_url, reg) {
        if (!reg) return;
        const check = () => void reg.update().catch(() => {});
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") check();
        });
        setInterval(check, 30 * 60_000);
      },
    }),
  );
}
