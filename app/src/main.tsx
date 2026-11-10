import { render } from "preact";
import { App } from "./components/App.tsx";
import { boot } from "./state/store.ts";
import "./styles.css";

if ("scrollRestoration" in history) history.scrollRestoration = "manual";

render(<App />, document.getElementById("app")!);
void boot();

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  void import("virtual:pwa-register").then(({ registerSW }) => registerSW({ immediate: true }));
}
