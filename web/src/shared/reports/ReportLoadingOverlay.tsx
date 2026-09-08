import { Show, type JSX } from "solid-js";

/** Full-panel busy state so report grids do not look frozen while fetching. */
export const ReportLoadingOverlay = (props: {
  loading: boolean;
  label?: string;
  children: JSX.Element;
}) => (
  <div class="relative min-h-[12rem]">
    {props.children}
    <Show when={props.loading}>
      <div
        class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/75 backdrop-blur-[1px]"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <span
          class="h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600"
          aria-hidden="true"
        />
        <p class="text-sm font-medium text-text-secondary">{props.label ?? "Loading report…"}</p>
      </div>
    </Show>
  </div>
);
