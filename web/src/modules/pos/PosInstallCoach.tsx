import { Show, createSignal, onCleanup, onMount } from "solid-js";
import { useViewportMode } from "../../shell/useViewportMode";

const DISMISS_KEY = "pos_pwa_install_coach_dismissed";

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

/**
 * In-POS Add-to-Home-Screen coach (D14). Does not change PWA start_url —
 * still opens ERP production home; cashier bookmarks /app/pos after install.
 */
export function PosInstallCoach() {
  const viewport = useViewportMode();
  const [deferred, setDeferred] = createSignal<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissedSig] = createSignal(true);
  const [iosHint, setIosHint] = createSignal(false);

  onMount(() => {
    try {
      setDismissedSig(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissedSig(false);
    }
    setIosHint(isIosDevice() && !viewport.isStandalone());

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    onCleanup(() => window.removeEventListener("beforeinstallprompt", onBip));
  });

  const show = () => !viewport.isStandalone() && !dismissed() && (deferred() != null || iosHint());

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
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
    <Show when={show()}>
      <div
        class="flex flex-wrap items-start justify-between gap-2 border-b border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950 sm:px-5"
        role="status"
      >
        <div class="min-w-0 flex-1">
          <p class="font-semibold">Install for faster POS</p>
          <Show
            when={iosHint() && !deferred()}
            fallback={
              <p class="text-xs text-sky-800/80">
                Add Bluearm to your home screen. After install, open <span class="font-medium">/app/pos</span> for the
                register (app home stays Production). Needs network to sell.
              </p>
            }
          >
            <p class="text-xs text-sky-800/80">
              iPhone/iPad: Share → Add to Home Screen, then open <span class="font-medium">/app/pos</span> from the app.
            </p>
          </Show>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <Show when={deferred()}>
            <button
              type="button"
              class="rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800"
              onClick={() => void install()}
            >
              Install
            </button>
          </Show>
          <button
            type="button"
            class="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-medium text-sky-900"
            onClick={dismiss}
          >
            Not now
          </button>
        </div>
      </div>
    </Show>
  );
}
