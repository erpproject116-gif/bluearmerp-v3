import { A } from "@solidjs/router";
import { For, Show, createSignal } from "solid-js";
import { useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";
import { useOnboarding, type OnboardingTrack, type OnboardingTrackStep } from "./usePlatform";

export function OnboardingChecklist(props: { compact?: boolean }) {
  const q = useOnboarding();
  const data = () => q.data;
  const showSetup = () => data()?.show_setup_checklist ?? false;
  const showPlaybook = () => data()?.show_playbook ?? false;
  const show = () => showSetup() || showPlaybook();
  const progressPercent = () =>
    showPlaybook() ? (data()?.overall_percent ?? 0) : (data()?.percent ?? 0);

  const nextHref = () => {
    if (showSetup()) return data()!.next_step?.href ?? "/app/setup";
    return data()!.next_extended_step?.href ?? "/app/onboarding";
  };
  const nextLabel = () => {
    if (showSetup()) return data()!.next_step?.label ?? "Continue setup";
    const ext = data()!.next_extended_step;
    if (ext) return `${ext.track_title}: ${ext.label}`;
    return "Open playbook";
  };

  return (
    <Show when={show()}>
      <div class={`rounded-xl border border-stroke bg-white ${props.compact ? "p-4" : "p-6 shadow-sm"}`}>
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold text-text-primary">
              {showPlaybook() ? "Onboarding playbook" : "Start here — workspace setup"}
            </h2>
            <p class="mt-1 text-xs text-text-secondary">
              {progressPercent()}% complete
              <Show when={showPlaybook()}>
                {" "}
                — ERP modules, POS, and operations
              </Show>
            </p>
          </div>
          <Show when={showPlaybook()}>
            <A href="/app/onboarding" class="text-xs font-medium text-brand-600 hover:underline">
              Full playbook
            </A>
          </Show>
        </div>

        <div class="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            class="h-full rounded-full bg-brand-600 transition-all"
            style={{ width: `${progressPercent()}%` }}
          />
        </div>

        <Show when={showSetup()}>
          <ul class="mt-4 space-y-2">
            <For each={data()!.steps.slice(0, props.compact ? 3 : undefined)}>
              {(step) => <OnboardingStepRow step={step} />}
            </For>
          </ul>
        </Show>

        <Show when={showPlaybook() && props.compact}>
          <p class="mt-3 text-xs text-text-secondary">
            Foundation is complete. Work through selling, buying, POS, finance, and more.
          </p>
        </Show>

        <A
          href={nextHref()}
          class="mt-4 inline-block rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700"
        >
          Next: {nextLabel()}
        </A>
      </div>
    </Show>
  );
}

function OnboardingStepRow(props: { step: { label: string; href: string; done: boolean } }) {
  return (
    <li class="flex items-center gap-2 text-sm">
      <span
        class={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
          props.step.done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-text-secondary"
        }`}
      >
        {props.step.done ? "✓" : "·"}
      </span>
      <Show
        when={!props.step.done}
        fallback={<span class="text-text-secondary line-through">{props.step.label}</span>}
      >
        <A href={props.step.href} class="text-brand-700 hover:underline">
          {props.step.label}
        </A>
      </Show>
    </li>
  );
}

export function OnboardingTrackPanel(props: { track: OnboardingTrack; defaultOpen?: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = createSignal(props.defaultOpen ?? false);
  const [acking, setAcking] = createSignal<string | null>(null);

  const ack = async (step: OnboardingTrackStep) => {
    setAcking(step.id);
    try {
      await apiFetch("/api/v1/platform/onboarding/ack-step", {
        method: "POST",
        body: JSON.stringify({ step_id: step.id }),
      });
      await qc.invalidateQueries({ queryKey: ["onboarding"] });
    } finally {
      setAcking(null);
    }
  };

  const doneCount = () => props.track.steps.filter((s) => s.done).length;

  return (
    <section class="rounded-xl border border-stroke bg-white shadow-sm">
      <button
        type="button"
        class="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div class="min-w-0">
          <h3 class="font-semibold text-text-primary">{props.track.title}</h3>
          <p class="mt-0.5 text-xs text-text-secondary">{props.track.description}</p>
        </div>
        <div class="shrink-0 text-right">
          <p class="text-sm font-medium text-brand-700">{props.track.percent}%</p>
          <p class="text-xs text-text-secondary">
            {doneCount()}/{props.track.steps.length}
          </p>
        </div>
      </button>

      <Show when={open()}>
        <div class="border-t border-stroke px-5 pb-5">
          <div class="mb-3 mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              class="h-full rounded-full bg-brand-500"
              style={{ width: `${props.track.percent}%` }}
            />
          </div>
          <ul class="space-y-4">
            <For each={props.track.steps}>
              {(step) => (
                <li class="flex gap-3">
                  <span
                    class={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                      step.done ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-text-secondary"
                    }`}
                  >
                    {step.done ? "✓" : ""}
                  </span>
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <Show
                        when={!step.done}
                        fallback={
                          <span class="text-sm text-text-secondary line-through">{step.label}</span>
                        }
                      >
                        <A href={step.href} class="text-sm font-medium text-brand-700 hover:underline">
                          {step.label}
                        </A>
                      </Show>
                      <Show when={step.ack_step && !step.done}>
                        <button
                          type="button"
                          disabled={acking() === step.id}
                          class="text-xs text-text-secondary hover:text-brand-600 disabled:opacity-50"
                          onClick={() => void ack(step)}
                        >
                          Mark reviewed
                        </button>
                      </Show>
                    </div>
                    <Show when={step.description}>
                      <p class="mt-1 text-xs text-text-secondary">{step.description}</p>
                    </Show>
                    <Show when={step.kb_article_id}>
                      <A
                        href={`/app/documentation/kb/${step.kb_article_id}`}
                        class="mt-1 inline-block text-xs font-medium text-brand-600 hover:underline"
                      >
                        How to — step-by-step guide
                      </A>
                    </Show>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>
    </section>
  );
}
