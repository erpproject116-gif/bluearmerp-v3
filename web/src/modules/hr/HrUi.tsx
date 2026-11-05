import { For, Show, createSignal } from "solid-js";
import type { JSX } from "solid-js";

export type HrBadgeTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const badgeTone: Record<HrBadgeTone, string> = {
  neutral: "hr-badge-neutral",
  brand: "hr-badge-brand",
  success: "hr-badge-success",
  warning: "hr-badge-warning",
  danger: "hr-badge-danger",
  info: "hr-badge-info",
};

export function HrBadge(props: { tone?: HrBadgeTone; children: JSX.Element }) {
  return <span class={`hr-badge ${badgeTone[props.tone ?? "neutral"]}`}>{props.children}</span>;
}

export function HrPlanned() {
  return <span class="hr-planned">Planned</span>;
}

export function HrEmpty(props: { title: string; hint?: string }) {
  return (
    <div class="hr-empty">
      <div class="hr-empty-ico" aria-hidden="true">∅</div>
      <h3>{props.title}</h3>
      <Show when={props.hint}><p class="text-sm text-text-secondary">{props.hint}</p></Show>
    </div>
  );
}

export function HrNotice(props: { children: JSX.Element }) {
  return <div class="hr-notice">{props.children}</div>;
}

export function HrSkel(props: { width?: string }) {
  return <div class="hr-skel" style={props.width ? { width: props.width } : undefined} />;
}

export function HrPageHead(props: {
  title: JSX.Element | string;
  subtitle?: string;
  crumb?: JSX.Element;
  actions?: JSX.Element;
}) {
  return (
    <div class="hr-pagehead">
      <div>
        <Show when={props.crumb}><div class="hr-crumb">{props.crumb}</div></Show>
        <h1>{props.title}</h1>
        <Show when={props.subtitle}><p>{props.subtitle}</p></Show>
      </div>
      <Show when={props.actions}><div>{props.actions}</div></Show>
    </div>
  );
}

export function HrTcard(props: { toolbar?: JSX.Element; children: JSX.Element; class?: string }) {
  return (
    <div class={`hr-tcard ${props.class ?? ""}`}>
      <Show when={props.toolbar}><div class="hr-toolbar">{props.toolbar}</div></Show>
      {props.children}
    </div>
  );
}

export function HrSteps(props: {
  steps: string[];
  current: number;
  onSelect?: (index: number) => void;
}) {
  const pct = () => {
    const n = props.steps.length;
    if (n <= 1) return 100;
    return Math.round(((props.current + 1) / n) * 100);
  };
  return (
    <div class="hr-wiz">
      <ol class="hr-steps-pill">
        <For each={props.steps}>
          {(label, i) => (
            <li
              classList={{ on: i() === props.current, done: i() < props.current }}
              onClick={() => props.onSelect?.(i())}
            >
              {label}
            </li>
          )}
        </For>
      </ol>
      <div class="hr-wiz-bar"><i style={{ width: `${pct()}%` }} /></div>
    </div>
  );
}

export function HrWizardNav(props: {
  canBack: boolean;
  canNext: boolean;
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
}) {
  return (
    <div class="hr-wiz-nav">
      <button type="button" class="rounded-lg border border-stroke px-3 py-1.5 text-sm" disabled={!props.canBack} onClick={props.onBack}>
        ← Back
      </button>
      <button type="button" class="rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white" disabled={!props.canNext} onClick={props.onNext}>
        {props.nextLabel ?? "Next →"}
      </button>
    </div>
  );
}

/** Local wizard index helper for pages that need step state. */
export function useHrStep(initial = 0) {
  const [step, setStep] = createSignal(initial);
  return {
    step,
    setStep,
    next: (max: number) => setStep((s) => Math.min(max, s + 1)),
    back: () => setStep((s) => Math.max(0, s - 1)),
  };
}
