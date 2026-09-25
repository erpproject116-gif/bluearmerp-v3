import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { useLocation } from "@solidjs/router";
import { supabase } from "./api";
import { useAuth } from "./auth-context";
import { describePresencePath } from "./presenceLabels";
import { clearPresence, sendPresenceHeartbeat } from "./usePresence";
import { signOutApp } from "./signOut";

const HEARTBEAT_MS = 45_000;
const ROUTE_DEBOUNCE_MS = 750;

async function resolveAvatarUrl(meAvatar?: string | null): Promise<string | undefined> {
  if (meAvatar?.trim()) return meAvatar.trim();
  const { data } = await supabase.auth.getUser();
  const meta = data.user?.user_metadata as Record<string, unknown> | undefined;
  const fromMeta =
    (typeof meta?.avatar_url === "string" && meta.avatar_url) ||
    (typeof meta?.picture === "string" && meta.picture) ||
    "";
  return fromMeta.trim() || undefined;
}

/** Sends periodic presence heartbeats while the user is in the app shell. */
export function PresenceHeartbeat() {
  const loc = useLocation();
  const auth = useAuth();
  const [avatarUrl, setAvatarUrl] = createSignal<string | undefined>();

  let timer: ReturnType<typeof setInterval> | undefined;
  let routeTimer: ReturnType<typeof setTimeout> | undefined;

  const pulse = async () => {
    if (!auth.me) return;
    const path = loc.pathname;
    await sendPresenceHeartbeat({
      current_path: path,
      current_label: describePresencePath(path),
      activity: path.includes("/new") || path.endsWith("/settings") ? "editing" : "viewing",
      // Prefer DB flag on the API side; still avoid pushing a URL when the user hid their photo.
      avatar_url: auth.me.user.avatar_hidden_from_others ? undefined : avatarUrl(),
    });
  };

  // A hidden tab is not "present", so the heartbeat stops instead of writing
  // presence rows for a window nobody is looking at. Becoming visible pulses once
  // and restarts the cadence.
  const startTimer = () => {
    if (timer) return;
    timer = setInterval(() => void pulse(), HEARTBEAT_MS);
  };
  const stopTimer = () => {
    if (!timer) return;
    clearInterval(timer);
    timer = undefined;
  };

  onMount(async () => {
    setAvatarUrl(await resolveAvatarUrl(auth.me?.user.avatar_url));
    if (!document.hidden) {
      void pulse();
      startTimer();
    }

    const onVis = () => {
      if (document.visibilityState === "visible") {
        void pulse();
        startTimer();
      } else {
        stopTimer();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    onCleanup(() => {
      document.removeEventListener("visibilitychange", onVis);
      stopTimer();
      if (routeTimer) clearTimeout(routeTimer);
      void clearPresence();
    });
  });

  createEffect(() => {
    if (!auth.me) return;
    loc.pathname;
    if (routeTimer) clearTimeout(routeTimer);
    routeTimer = setTimeout(() => void pulse(), ROUTE_DEBOUNCE_MS);
  });

  createEffect(() => {
    const me = auth.me;
    if (!me) return;
    void resolveAvatarUrl(me.user.avatar_url).then(setAvatarUrl);
  });

  return null;
}

/** Clears presence on sign-out (call before supabase.auth.signOut). */
export async function signOutWithPresenceClear() {
  await signOutApp();
}
