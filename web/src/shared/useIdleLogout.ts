import { createSignal, createEffect, onCleanup, onMount } from "solid-js";
import { useLocation } from "@solidjs/router";
import { useAuth } from "./auth-context";
import { signOutApp } from "./signOut";
import {
  IDLE_LOGOUT_MS,
  IDLE_WARN_MS,
  LAST_ACTIVITY_STORAGE_KEY,
  isIdleLogoutExemptPath,
  readLocalActivity,
  touchLocalActivity,
} from "./sessionIdleClient";
import { buildSignInHref, captureReturnTo } from "./authReturnTo";

const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "scroll"] as const;
const THROTTLE_MS = 5_000;

export function useIdleLogout() {
  const auth = useAuth();
  const loc = useLocation();
  const [showWarning, setShowWarning] = createSignal(false);

  let warnTimer: ReturnType<typeof setTimeout> | undefined;
  let logoutTimer: ReturnType<typeof setTimeout> | undefined;
  let lastBump = 0;

  const enabled = () => Boolean(auth.me) && !isIdleLogoutExemptPath(loc.pathname);

  const clearTimers = () => {
    if (warnTimer) clearTimeout(warnTimer);
    if (logoutTimer) clearTimeout(logoutTimer);
    warnTimer = undefined;
    logoutTimer = undefined;
  };

  const scheduleFrom = (baseMs: number) => {
    clearTimers();
    if (!enabled()) return;

    const elapsed = Date.now() - baseMs;
    const warnIn = Math.max(0, IDLE_WARN_MS - elapsed);
    const logoutIn = Math.max(0, IDLE_LOGOUT_MS - elapsed);

    warnTimer = setTimeout(() => {
      if (enabled()) setShowWarning(true);
    }, warnIn);

    logoutTimer = setTimeout(() => {
      void doLogout();
    }, logoutIn);
  };

  const bump = () => {
    if (!enabled()) {
      setShowWarning(false);
      clearTimers();
      return;
    }
    const now = Date.now();
    if (now - lastBump < THROTTLE_MS) return;
    lastBump = now;
    touchLocalActivity();
    setShowWarning(false);
    scheduleFrom(now);
  };

  const doLogout = async () => {
    clearTimers();
    setShowWarning(false);
    const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    captureReturnTo(returnPath);
    await signOutApp("idle_timeout");
    window.location.href = buildSignInHref({ reason: "idle", next: returnPath });
  };

  const stayLoggedIn = () => bump();

  onMount(() => {
    const onActivity = () => bump();

    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, onActivity, { passive: true });
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key !== LAST_ACTIVITY_STORAGE_KEY) return;
      const ts = readLocalActivity();
      if (ts > 0) scheduleFrom(ts);
    };
    window.addEventListener("storage", onStorage);

    const onVis = () => {
      if (document.visibilityState === "visible") {
        const ts = readLocalActivity();
        if (ts > 0 && Date.now() - ts >= IDLE_LOGOUT_MS) {
          void doLogout();
          return;
        }
        bump();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    const initial = readLocalActivity();
    scheduleFrom(initial > 0 ? initial : Date.now());
    if (initial <= 0) touchLocalActivity();

    onCleanup(() => {
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, onActivity);
      }
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVis);
      clearTimers();
    });
  });

  createEffect(() => {
    auth.me;
    loc.pathname;
    if (!enabled()) {
      setShowWarning(false);
      clearTimers();
      return;
    }
    const ts = readLocalActivity();
    scheduleFrom(ts > 0 ? ts : Date.now());
  });

  return { showWarning, stayLoggedIn, doLogout };
}
