import { Show, createEffect, createSignal, onCleanup } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useAuth } from "./auth-context";

const SEEN_UNLOCKED_KEY = "commercial-thank-you-seen";

function formatPeso(centavos: number) {
  return `₱${(centavos / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Global paywall when commercial_status is awaiting_payment (or forced open on trade API block). */
export function CommercialPaywallHost() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [forceOpen, setForceOpen] = createSignal(false);
  const [prevStatus, setPrevStatus] = createSignal<string | undefined>();

  const status = () => auth.me?.commercial?.status;
  const amount = () => auth.me?.commercial?.amount_centavos ?? 450000;
  const showPaywall = () => status() === "awaiting_payment" || forceOpen();

  createEffect(() => {
    const s = status();
    const prev = prevStatus();
    if (prev === "awaiting_payment" && s === "unlocked") {
      try {
        if (sessionStorage.getItem(SEEN_UNLOCKED_KEY) !== "1") {
          sessionStorage.setItem(SEEN_UNLOCKED_KEY, "1");
          navigate("/app/thank-you-activated", { replace: false });
        }
      } catch {
        navigate("/app/thank-you-activated", { replace: false });
      }
    }
    if (s === "awaiting_payment") {
      setForceOpen(false);
    }
    setPrevStatus(s);
  });

  createEffect(() => {
    if (status() !== "awaiting_payment") return;
    const id = window.setInterval(() => {
      void auth.refresh({ background: true });
    }, 30000);
    const onFocus = () => void auth.refresh({ background: true });
    window.addEventListener("focus", onFocus);
    onCleanup(() => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    });
  });

  createEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ code?: string }>).detail;
      if (detail?.code === "ERR_COMMERCIAL_LOCKED") {
        setForceOpen(true);
        void auth.refresh({ background: true });
      }
    };
    window.addEventListener("bluearm:commercial-locked", handler);
    onCleanup(() => window.removeEventListener("bluearm:commercial-locked", handler));
  });

  return (
    <Show when={showPaywall() && status() !== "unlocked"}>
      <div class="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4">
        <div class="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
          <h2 class="text-lg font-semibold text-slate-900">Activate buying &amp; selling</h2>
          <p class="mt-1 text-sm text-slate-600">
            Day 1 setup is complete. Follow these steps — trade does <strong class="font-medium">not</strong> unlock
            the moment GCash sends.
          </p>
          <ol class="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
            <li>
              Pay{" "}
              <span class="font-semibold text-slate-900">{formatPeso(amount())}</span> via GCash using the QR below.
            </li>
            <li>Keep your reference number handy if support asks.</li>
            <li>A Bluearm product owner confirms your payment in Platform Command (manual step).</li>
            <li>After confirmation, buying and selling unlock — this page will update automatically.</li>
          </ol>
          <div class="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-[#007DFE]">
            <img
              src="/billing/gcash-day1-qr.svg"
              alt="GCash QR for Day 1 activation"
              class="mx-auto w-full max-w-sm bg-white object-contain"
            />
          </div>
          <p class="mt-3 text-xs text-slate-500">
            Transfer fees may apply. We refresh status every 30 seconds; unlocking still requires human payment
            confirmation — not instant GCash auto-verify.
          </p>
          <div class="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
              onClick={() => void auth.refresh({ background: true })}
            >
              I already paid — check status
            </button>
            <Show when={status() === "setup" || forceOpen()}>
              <button
                type="button"
                class="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => setForceOpen(false)}
              >
                Close
              </button>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
}

export function dispatchCommercialLocked(code?: string) {
  window.dispatchEvent(new CustomEvent("bluearm:commercial-locked", { detail: { code } }));
}
