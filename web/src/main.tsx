import { render } from "solid-js/web";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import App from "./App";
import { applyResolvedTheme } from "./shared/theme-preference";

applyResolvedTheme();

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // Auto-activate new shell so paywall/route fixes are not stuck behind an old SW.
    void updateSW(true);
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    void registration.update();
    window.setInterval(() => void registration.update(), 60_000);
  },
});

render(() => <App />, document.getElementById("root")!);

const bootSplash = document.getElementById("boot-splash");
if (bootSplash) {
  bootSplash.classList.add("is-done");
  window.setTimeout(() => bootSplash.remove(), 220);
}
