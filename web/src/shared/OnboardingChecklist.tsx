import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import { useOnboarding } from "./usePlatform";

export function OnboardingChecklist(props: { compact?: boolean }) {
  const q = useOnboarding();
  const data = () => q.data;

  return (
    <Show when={data() && !data()!.required_complete && (data()!.percent ?? 0) < 100}>
      <div class={`rounded-xl border border-stroke bg-white ${props.compact ? "p-4" : "p-6 shadow-sm"}`}>
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold text-text-primary">Start here</h2>
            <p class="mt-1 text-xs text-text-secondary">
              {data()!.percent}% complete — finish these steps to get your business running.
            </p>
          </div>
          <Show when={!props.compact}>
            <A href="/app/setup" class="text-xs font-medium text-brand-600 hover:underline">
              Continue setup
            </A>
          </Show>
        </div>

        <div class="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            class="h-full rounded-full bg-brand-600 transition-all"
            style={{ width: `${data()!.percent}%` }}
          />
        </div>

        <ul class="mt-4 space-y-2">
          <For each={data()!.steps.slice(0, props.compact ? 3 : undefined)}>
            {(step) => (
              <li class="flex items-center gap-2 text-sm">
                <span
                  class={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                    step.done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-text-secondary"
                  }`}
                >
                  {step.done ? "✓" : "·"}
                </span>
                <Show
                  when={!step.done}
                  fallback={<span class="text-text-secondary line-through">{step.label}</span>}
                >
                  <A href={step.href} class="text-brand-700 hover:underline">
                    {step.label}
                  </A>
                </Show>
              </li>
            )}
          </For>
        </ul>

        <Show when={data()!.next_step && props.compact}>
          <A
            href={data()!.next_step!.href}
            class="mt-4 inline-block rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700"
          >
            Next: {data()!.next_step!.label}
          </A>
        </Show>
      </div>
    </Show>
  );
}
