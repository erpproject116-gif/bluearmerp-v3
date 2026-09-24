import { render } from "solid-js/web";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import App from "./App";
import { applyResolvedTheme } from "./shared/theme-preference";
import { noteUpdateWaiting, promptUpdateIfWaiting, registerAcceptUpdate } from "./shell/appUpdate";

applyResolvedTheme();

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

const updateSW = registerSW({
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

render(() => <App />, document.getElementById("root")!);

const bootSplash = document.getElementById("boot-splash");
if (bootSplash) {
  bootSplash.classList.add("is-done");
  window.setTimeout(() => bootSplash.remove(), 220);
}
