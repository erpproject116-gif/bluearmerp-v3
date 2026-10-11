import { render } from "solid-js/web";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import App from "./App";
import { applyResolvedTheme } from "./shared/theme-preference";
import { noteUpdateWaiting, promptUpdateIfWaiting, registerAcceptUpdate } from "./shell/appUpdate";

applyResolvedTheme();

// Signed-in routes cannot paint the shell until this chunk arrives. Start it
// during session restore instead of after /auth/me returns. The installed app
// opens on the production hub, so that screen is warmed the same way.
const bootPath = window.location.pathname;
if (bootPath.startsWith("/app")) {
  void import("./shell/AppShell");
  if (bootPath === "/app/production" || bootPath.startsWith("/app/production/")) {
    void import("./modules/production/ProductionHubPage");
  }
}

function consumeResumePath() {
  const resume = sessionStorage.getItem("bluearm:resume-path");
  if (!resume) return;
  sessionStorage.removeItem("bluearm:resume-path");
  if (!resume.startsWith("/app/") || resume.startsWith("//")) return;
  const here = `${window.location.pathname}${window.location.search}`;
  const onHub = window.location.pathname === "/app/production" || window.location.pathname === "/app/production/";
  if (onHub && here !== resume) window.location.replace(resume);
}

consumeResumePath();

let updateSW: (reloadPage?: boolean) => Promise<void> = async () => {};

registerAcceptUpdate(async () => {
  window.dispatchEvent(new Event("bluearm:before-update"));
  const path = `${window.location.pathname}${window.location.search}`;
  sessionStorage.setItem("bluearm:resume-path", path);
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
  await updateSW(true);
});

function startServiceWorker() {
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      noteUpdateWaiting();
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => void registration.update();
      check();
      window.setInterval(check, 60_000);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "visible") return;
        promptUpdateIfWaiting();
        check();
      });
    },
  });
}

render(() => <App />, document.getElementById("root")!);

if (typeof requestIdleCallback === "function") {
  requestIdleCallback(() => startServiceWorker(), { timeout: 2500 });
} else {
  window.setTimeout(startServiceWorker, 1);
}

const bootSplash = document.getElementById("boot-splash");
if (bootSplash) {
  bootSplash.classList.add("is-done");
  window.setTimeout(() => bootSplash.remove(), 220);
}
