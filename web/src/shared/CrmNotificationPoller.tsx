import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { crmNotificationHref, crmSeverityToastType } from "./crmNotificationRoutes";
import { markCrmNotificationRead, useCrmNotificationFeed, useInvalidateCrmNotifications } from "./useCrmNotifications";
import { useToast } from "./toast";

type Props = {
  enabled: boolean;
  /** Non-CRM jobs poll source=handoff only. */
  handoffOnly?: boolean;
  /** Stable user id so seen-state resets across login/logout. */
  userId?: number | null;
};

let audioUnlocked = false;

function unlockHandoffAudio() {
  audioUnlocked = true;
}

function playHandoffTone() {
  if (!audioUnlocked) return;
  try {
    const Ctx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
    osc.onended = () => {
      void ctx.close();
    };
  } catch {
    // Autoplay can block the tone. The toast still shows.
  }
}

type SessionState = {
  userId: number | null;
  seenUnreadIds: Set<number>;
  bootstrapped: boolean;
  handoffBaselined: boolean;
};

let session: SessionState = {
  userId: null,
  seenUnreadIds: new Set(),
  bootstrapped: false,
  handoffBaselined: false,
};

function ensureSession(userId: number | null | undefined): SessionState {
  const id = userId ?? null;
  if (session.userId !== id) {
    session = { userId: id, seenUnreadIds: new Set(), bootstrapped: false, handoffBaselined: false };
  }
  return session;
}

/**
 * Shows clickable toasts for new warning/critical CRM notifications.
 * Shares the shell feed with the bell; filters unread rows client-side.
 */
export function CrmNotificationPoller(props: Props) {
  const toast = useToast();
  const navigate = useNavigate();
  const invalidate = useInvalidateCrmNotifications();
  const [tick, setTick] = createSignal(0);

  const feed = useCrmNotificationFeed(
    () => props.enabled,
    () => (props.handoffOnly ? "handoff" : ""),
  );

  onMount(() => {
    const unlock = () => unlockHandoffAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    onCleanup(() => window.removeEventListener("pointerdown", unlock));
    if (!props.enabled) return;
    const state = ensureSession(props.userId);
    const t = window.setTimeout(() => {
      state.bootstrapped = true;
      setTick((n) => n + 1);
    }, 2500);
    onCleanup(() => window.clearTimeout(t));
  });

  createEffect(() => {
    if (!props.enabled) return;
    tick();
    const state = ensureSession(props.userId);
    const rows = (feed.data?.rows ?? []).filter((n) => !n.read_at);
    if (feed.data && !state.handoffBaselined) {
      state.handoffBaselined = true;
      for (const n of rows) {
        if (n.source === "handoff") state.seenUnreadIds.add(n.id);
      }
    }
    for (const n of rows) {
      if (state.seenUnreadIds.has(n.id)) continue;
      state.seenUnreadIds.add(n.id);
      if (!state.bootstrapped) continue;
      const handoff = n.source === "handoff";
      const severe = n.severity === "warning" || n.severity === "critical";
      if (!handoff && !severe) continue;
      if (handoff) playHandoffTone();
      const href = crmNotificationHref(n);
      toast.action({
        type: crmSeverityToastType(n.severity),
        title: n.title,
        message: n.body || undefined,
        actionLabel: "Open",
        onAction: () => {
          if (!n.read_at) {
            void markCrmNotificationRead(n.id).then(() => invalidate());
          }
          navigate(href);
        },
      });
    }
  });

  return null;
}
