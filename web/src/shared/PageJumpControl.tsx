import { For, Show, createEffect, createSignal } from "solid-js";

type Props = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Compact label style for report toolbars. */
  compact?: boolean;
};

/**
 * Page jump control: select when totalPages <= 100, otherwise number + Go.
 * Hide when only one page.
 */
export function PageJumpControl(props: Props) {
  const [draft, setDraft] = createSignal(String(props.page));

  createEffect(() => {
    setDraft(String(props.page));
  });

  const go = (raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      setDraft(String(props.page));
      return;
    }
    const clamped = Math.min(props.totalPages, Math.max(1, Math.floor(n)));
    setDraft(String(clamped));
    if (clamped !== props.page) props.onPageChange(clamped);
  };

  return (
    <Show when={props.totalPages > 1}>
      <Show
        when={props.totalPages <= 100}
        fallback={
          <span class="inline-flex items-center gap-1 text-sm text-text-secondary">
            <span class={props.compact ? "sr-only" : undefined}>Page</span>
            <input
              type="number"
              min={1}
              max={props.totalPages}
              class="h-8 w-16 rounded-lg border border-stroke bg-white px-2 text-sm text-text-primary"
              value={draft()}
              onInput={(e) => setDraft(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  go(draft());
                }
              }}
              aria-label="Go to page"
            />
            <span>of {props.totalPages}</span>
            <button
              type="button"
              class="rounded-lg border border-stroke px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
              onClick={() => go(draft())}
            >
              Go
            </button>
          </span>
        }
      >
        <label class="inline-flex items-center gap-1.5 text-sm text-text-secondary">
          <span class={props.compact ? "sr-only" : undefined}>Page</span>
          <select
            class="h-8 rounded-lg border border-stroke bg-white px-2 text-sm text-text-primary"
            value={props.page}
            aria-label="Jump to page"
            onChange={(e) => props.onPageChange(Number(e.currentTarget.value))}
          >
            <For each={Array.from({ length: props.totalPages }, (_, i) => i + 1)}>
              {(n) => <option value={n}>{n}</option>}
            </For>
          </select>
          <span>of {props.totalPages}</span>
        </label>
      </Show>
    </Show>
  );
}
