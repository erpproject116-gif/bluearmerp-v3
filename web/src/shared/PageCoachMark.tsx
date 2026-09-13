import { Show, createSignal, onMount } from "solid-js";

/** Dismissible one-line hint; persisted in localStorage (optional route-scoped coach marks). */
export function PageCoachMark(props: {
  storageKey: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  const [hidden, setHidden] = createSignal(true);

  onMount(() => {
    try {
      setHidden(localStorage.getItem(props.storageKey) === "1");
    } catch {
      setHidden(false);
    }
  });

  const dismiss = () => {
    try {
      localStorage.setItem(props.storageKey, "1");
    } catch {
      /* ignore */
    }
    setHidden(true);
  };

  return (
    <Show when={!hidden()}>
      <div
        class="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50/70 px-4 py-3 text-sm text-text-primary"
        role="note"
      >
        <p class="min-w-0 flex-1 leading-snug">{props.message}</p>
        <div class="flex shrink-0 flex-wrap items-center gap-2">
          <Show when={props.actionHref && props.actionLabel}>
            <a
              href={props.actionHref!}
              class="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700"
            >
              {props.actionLabel}
            </a>
          </Show>
          <button type="button" class="text-xs text-text-secondary hover:text-brand-700" onClick={dismiss}>
            Got it
          </button>
        </div>
      </div>
    </Show>
  );
}
