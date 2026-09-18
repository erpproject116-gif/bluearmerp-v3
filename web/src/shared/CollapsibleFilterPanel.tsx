import { createSignal, Show, type JSX } from "solid-js";

type Props = {
  title: string;
  description?: string;
  /** Open by default so Search/filters are visible; pass false to start collapsed. */
  defaultOpen?: boolean;
  children: JSX.Element;
  actions?: JSX.Element;
};

/** Collapsible filter/search card used on report and list pages. */
export function CollapsibleFilterPanel(props: Props) {
  const [open, setOpen] = createSignal(props.defaultOpen !== false);

  return (
    <section class="rounded-xl border border-stroke bg-white shadow-sm">
      <button
        type="button"
        class="flex w-full items-start justify-between gap-3 px-5 py-4 text-left"
        aria-expanded={open()}
        onClick={() => setOpen((v) => !v)}
      >
        <div class="min-w-0">
          <h2 class="text-lg font-semibold text-text-primary">{props.title}</h2>
          <Show when={props.description}>
            <p class="text-sm text-text-secondary">{props.description}</p>
          </Show>
          <Show when={!open()}>
            <p class="mt-1 text-xs text-brand-600">Filters hidden — click to expand · Search (F8)</p>
          </Show>
        </div>
        <span class="mt-1 shrink-0 rounded border border-stroke px-2 py-0.5 text-xs text-text-secondary">
          {open() ? "Hide filters" : "Show filters"}
        </span>
      </button>
      <Show when={open()}>
        <div class="border-t border-stroke px-5 pb-5 pt-4">
          {props.children}
          <Show when={props.actions}>
            <div class="mt-4 flex flex-wrap gap-2 border-t border-stroke pt-4">{props.actions}</div>
          </Show>
        </div>
      </Show>
    </section>
  );
}
