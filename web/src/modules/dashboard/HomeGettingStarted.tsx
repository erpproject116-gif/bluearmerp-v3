import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import { canManageWorkspaceSetup } from "../../shared/resolveAppEntryPath";
import { useAuth } from "../../shared/auth-context";
import { useSetupReadiness } from "../../shared/usePlatform";
import { resolveGettingStarted } from "../../shared/setupProgress";

/** Guided Home checklist — dedicated Getting started tab until setup is done. */
export function HomeGettingStarted(props: { mode?: "page" | "embed" } = {}) {
  const auth = useAuth();
  const setup = useSetupReadiness();
  const canManage = () => canManageWorkspaceSetup(auth.me);
  const progress = () => resolveGettingStarted(setup.data);
  const page = () => props.mode === "page";

  return (
    <>
      <Show when={canManage() && progress().visible}>
        <section
          class="rounded-xl border border-brand-200 bg-brand-50/40 p-5 shadow-sm"
          classList={{ "max-w-3xl": page() }}
        >
          <div class="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-brand-700">Getting started</p>
              <h3 class="text-base font-semibold text-text-primary">Set up the basics, then make your first sale</h3>
              <p class="mt-1 text-sm text-text-secondary">
                Work through each step at your own pace. This tab stays available until required setup is done.
              </p>
            </div>
            <A
              href={progress().next?.href ?? "/app/setup"}
              class="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              Continue
            </A>
          </div>
          <div class="mb-3">
            <div class="mb-1 flex items-center justify-between text-xs text-text-secondary">
              <span>Progress</span>
              <span class="font-semibold text-text-primary">{progress().percent}%</span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-white/80 ring-1 ring-brand-100">
              <div class="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${progress().percent}%` }} />
            </div>
          </div>
          <ul class="grid gap-2 sm:grid-cols-2">
            <For each={progress().steps}>
              {(step) => (
                <li>
                  <A
                    href={step.href}
                    class="flex items-start gap-2 rounded-lg border border-stroke/80 bg-white px-3 py-2.5 text-sm hover:border-brand-300"
                  >
                    <span
                      class={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                        step.done
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-white text-text-secondary ring-1 ring-stroke"
                      }`}
                    >
                      {step.done ? "✓" : ""}
                    </span>
                    <span class="min-w-0">
                      <span
                        class="block font-medium"
                        classList={{
                          "text-text-secondary line-through": step.done,
                          "text-text-primary": !step.done,
                        }}
                      >
                        {step.label}
                        <Show when={!step.required}>
                          <span class="ml-1 text-xs font-normal text-text-secondary">Optional</span>
                        </Show>
                      </span>
                      <span class="mt-0.5 block text-xs text-text-secondary">{step.blurb}</span>
                    </span>
                  </A>
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>

      <Show when={page() && !canManage() && setup.data && !setup.data.required_complete}>
        <section class="max-w-2xl rounded-xl border border-stroke bg-surface p-5 shadow-sm">
          <h3 class="text-base font-semibold text-text-primary">Your team workspace is being set up</h3>
          <p class="mt-2 text-sm text-text-secondary">
            An administrator is finishing the initial configuration — company details, accounts, products, and locations.
            You can explore the app from the Dashboard tab; some documents may stay read-only until setup is complete.
          </p>
          <A href="/app/dashboard" class="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline">
            Go to Dashboard →
          </A>
        </section>
      </Show>

      <Show when={page() && canManage() && !progress().visible}>
        <section class="max-w-2xl rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-sm">
          <h3 class="text-base font-semibold text-text-primary">You&apos;re all set</h3>
          <p class="mt-2 text-sm text-text-secondary">
            Required setup is complete. Use Dashboard for daily numbers, Recent updates for activity, or open the onboarding
            playbook for deeper training.
          </p>
          <div class="mt-4 flex flex-wrap gap-3 text-sm">
            <A href="/app/dashboard" class="font-medium text-brand-600 hover:underline">
              Dashboard
            </A>
            <A href="/app/onboarding" class="font-medium text-brand-600 hover:underline">
              Onboarding playbook
            </A>
          </div>
        </section>
      </Show>
    </>
  );
}
