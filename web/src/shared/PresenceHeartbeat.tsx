import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { useLocation } from "@solidjs/router";
import { supabase } from "./api";
import { useAuth } from "./auth-context";
import { describePresencePath } from "./presenceLabels";
import { clearPresence, sendPresenceHeartbeat } from "./usePresence";

const HEARTBEAT_MS = 30_000;

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

  const pulse = async () => {
    if (!auth.me) return;
    const path = loc.pathname;
    await sendPresenceHeartbeat({
      current_path: path,
      current_label: describePresencePath(path),
      activity: path.includes("/new") || path.endsWith("/settings") ? "editing" : "viewing",
      avatar_url: avatarUrl(),
    });
  };

  onMount(async () => {
    setAvatarUrl(await resolveAvatarUrl(auth.me?.user.avatar_url));
    void pulse();
    timer = setInterval(() => void pulse(), HEARTBEAT_MS);

    const onVis = () => {
      if (document.visibilityState === "visible") void pulse();
    };
    document.addEventListener("visibilitychange", onVis);
    onCleanup(() => {
      document.removeEventListener("visibilitychange", onVis);
      if (timer) clearInterval(timer);
      void clearPresence();
    });
  });

  createEffect(() => {
    if (!auth.me) return;
    loc.pathname;
    void pulse();
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
  await clearPresence();
  await supabase.auth.signOut();
}
