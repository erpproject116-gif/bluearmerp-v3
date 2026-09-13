import { Show, createSignal, onCleanup, onMount } from "solid-js";
import { useViewportMode } from "./useViewportMode";

const DISMISS_KEY = "bluearm-pwa-install-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iOS = /iPhone|iPad|iPod/i.test(ua);
  const iPadOs = navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1;
  return iOS || iPadOs;
}

function isDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function setDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Chrome/Android install prompt + iOS Add to Home Screen copy. Online-only PWA. */
export function InstallAppBanner() {
  const viewport = useViewportMode();
  const [deferred, setDeferred] = createSignal<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissedSig] = createSignal(true);
  const [iosHint, setIosHint] = createSignal(false);

  onMount(() => {
    setDismissedSig(isDismissed());
    setIosHint(isIosDevice() && !viewport.isStandalone());

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    onCleanup(() => window.removeEventListener("beforeinstallprompt", onBip));
  });

  const showAndroid = () =>
    !viewport.isStandalone() && !dismissed() && deferred() != null;
  const showIos = () =>
    !viewport.isStandalone() && !dismissed() && iosHint() && deferred() == null;

  const dismiss = () => {
    setDismissed();
    setDismissedSig(true);
  };

  const install = async () => {
    const ev = deferred();
    if (!ev) return;
    await ev.prompt();
    try {
      const choice = await ev.userChoice;
      if (choice.outcome === "accepted") dismiss();
    } catch {
      /* ignore */
    }
    setDeferred(null);
  };

  return (
    <Show when={showAndroid() || showIos()}>
      <div
        class="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50/70 px-4 py-3 text-sm text-text-primary"
        role="status"
      >
        <div class="min-w-0 flex-1 space-y-1">
          <p class="font-semibold">Install Bluearm</p>
          <Show
            when={showIos()}
            fallback={
              <p class="text-text-secondary">
                Add to your home screen for a floor-first app window. Needs network — posting stays online-only.
              </p>
            }
          >
            <p class="text-text-secondary">
              On iPhone/iPad: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>. Opens without Safari
              chrome; still needs internet to save or post.
            </p>
          </Show>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <Show when={showAndroid()}>
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
              onClick={() => void install()}
            >
              Install Bluearm
            </button>
          </Show>
          <button
            type="button"
            class="rounded-lg border border-stroke bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-slate-50"
            onClick={dismiss}
          >
            Not now
          </button>
        </div>
      </div>
    </Show>
  );
}
