import { Show, createSignal, onMount } from "solid-js";
import { A } from "@solidjs/router";
import { useAuth } from "./auth-context";

const DISMISS_KEY = "bluearm.demoTenantBanner.dismissed";

/** Persistent notice when the active tenant is a demo / sample-data workspace. */
export function DemoTenantBanner() {
  const auth = useAuth();
  const [dismissed, setDismissed] = createSignal(false);

  onMount(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      /* ignore */
    }
  });

  const isDemo = () => Boolean(auth.me?.tenant?.is_demo);

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <Show when={isDemo() && !dismissed()}>
      <div class="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
        <div class="min-w-0 space-y-1">
          <p class="font-medium">Sample / demo workspace</p>
          <p class="text-sky-900/90">
            This business ({auth.me?.tenant?.company_code ?? "demo"}) may include sample partners, items, and
            documents. Do not treat them as live customer data. Clear sample documents (and optionally masters) under{" "}
            <A href="/app/user-management/demo-data" class="underline font-medium">
              User Management → Demo data
            </A>
            .
          </p>
        </div>
        <button
          type="button"
          class="shrink-0 rounded-md border border-sky-300 bg-white px-2.5 py-1 text-xs font-medium text-sky-900 hover:bg-sky-100"
          onClick={dismiss}
        >
          Dismiss
        </button>
      </div>
    </Show>
  );
}
