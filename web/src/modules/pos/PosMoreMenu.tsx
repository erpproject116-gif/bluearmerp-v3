import { For, Show, createSignal, onCleanup, onMount } from "solid-js";

type MoreItem = {
  id: string;
  label: string;
  onClick: () => void;
  hidden?: boolean;
};

/** Collapses advanced POS actions into one “More” control (≤4 visible actions). */
export function PosMoreMenu(props: { items: MoreItem[]; class?: string }) {
  const [open, setOpen] = createSignal(false);
  let root: HTMLDivElement | undefined;

  // Cap at 4 visible actions; prefer void when present by keeping list order as passed.
  const visible = () => props.items.filter((i) => !i.hidden).slice(0, 4);

  onMount(() => {
    const onDoc = (e: MouseEvent) => {
      if (!root?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    onCleanup(() => document.removeEventListener("mousedown", onDoc));
  });

  return (
    <div class={`relative ${props.class ?? ""}`} ref={root}>
      <button
        type="button"
        class="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-black/5"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open()}
      >
        More
      </button>
      <Show when={open()}>
        <div class="absolute right-0 z-40 mt-1 min-w-[10rem] rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          <For each={visible()}>
            {(item) => (
              <button
                type="button"
                class="block w-full px-4 py-2.5 text-left text-sm text-slate-800 hover:bg-slate-50"
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
              >
                {item.label}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
