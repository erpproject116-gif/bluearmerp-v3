import type { JSX } from "solid-js";
import { onMount } from "solid-js";

export type ViewMode = "table" | "board";

type Props = {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  /** Persist preference in localStorage when set. */
  storageKey?: string;
};

export function loadViewMode(storageKey: string, fallback: ViewMode = "table"): ViewMode {
  try {
    const v = localStorage.getItem(storageKey);
    if (v === "table" || v === "board") return v;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function ViewModeToggle(props: Props): JSX.Element {
  onMount(() => {
    if (!props.storageKey) return;
    const saved = loadViewMode(props.storageKey);
    if (saved !== props.value) props.onChange(saved);
  });

  const select = (mode: ViewMode) => {
    if (props.storageKey) {
      try {
        localStorage.setItem(props.storageKey, mode);
      } catch {
        /* ignore */
      }
    }
    props.onChange(mode);
  };

  return (
    <div class="inline-flex rounded-lg border border-stroke bg-slate-50 p-0.5" role="group" aria-label="View mode">
      <button
        type="button"
        class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
        classList={{
          "bg-white text-brand-600 shadow-sm": props.value === "table",
          "text-text-secondary hover:text-text-primary": props.value !== "table",
        }}
        onClick={() => select("table")}
      >
        Table
      </button>
      <button
        type="button"
        class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
        classList={{
          "bg-white text-brand-600 shadow-sm": props.value === "board",
          "text-text-secondary hover:text-text-primary": props.value !== "board",
        }}
        onClick={() => select("board")}
      >
        Board
      </button>
    </div>
  );
}
