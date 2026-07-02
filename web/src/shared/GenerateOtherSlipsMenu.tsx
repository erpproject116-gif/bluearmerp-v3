import { type Accessor, For, Show, createSignal, onCleanup, onMount } from "solid-js";
import { apiFetch } from "./api";
import { useToast } from "./toast";
import { toolbarControlClass } from "./SpreadsheetGrid";

export type GenerateTarget = {
  label: string;
  targetEntity: string;
};

type Props = {
  sourceEntity: string;
  targets: GenerateTarget[];
  selectedIds: Accessor<number[]>;
  onSuccess?: (result: { target_ids: number[]; warnings?: string[] }) => void;
};

type GenerateResult = {
  target_ids: number[];
  warnings?: string[];
};

export function GenerateOtherSlipsMenu(props: Props) {
  const toast = useToast();
  const [open, setOpen] = createSignal(false);
  const [busy, setBusy] = createSignal<string | null>(null);

  onMount(() => {
    const closeClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-generate-slips-menu]")) setOpen(false);
    };
    const closeKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", closeClick);
    document.addEventListener("keydown", closeKey);
    onCleanup(() => {
      document.removeEventListener("click", closeClick);
      document.removeEventListener("keydown", closeKey);
    });
  });

  const ids = () => props.selectedIds().filter((id) => id > 0);
  const disabled = () => ids().length === 0 || busy() != null;

  const generate = async (targetEntity: string, label: string) => {
    const sourceIds = ids();
    if (sourceIds.length === 0) {
      toast.warning("Select at least one row first.");
      return;
    }
    setBusy(targetEntity);
    setOpen(false);
    const res = await apiFetch<GenerateResult>("/api/v1/doc-generation/generate", {
      method: "POST",
      body: JSON.stringify({
        source_entity: props.sourceEntity,
        target_entity: targetEntity,
        source_ids: sourceIds,
      }),
    });
    setBusy(null);
    if (!res.success || !res.data) {
      toast.error(res.message ?? `Failed to generate ${label}.`);
      return;
    }
    const count = res.data.target_ids.length;
    const warn = res.data.warnings?.length ? ` ${res.data.warnings.join(" ")}` : "";
    toast.success(res.message ?? `Generated ${count} ${label}(s).${warn}`);
    props.onSuccess?.(res.data);
  };

  return (
    <div class="relative" data-generate-slips-menu>
      <button
        type="button"
        class={`${toolbarControlClass} inline-flex items-center gap-1 disabled:opacity-50`}
        disabled={disabled()}
        aria-expanded={open()}
        aria-haspopup="menu"
        title={disabled() ? "Select row(s) to generate slips" : "Generate related documents"}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled()) return;
          setOpen((v) => !v);
        }}
      >
        {busy() ? "Generating…" : "Generate slip"}
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7" />
        </svg>
      </button>
      <Show when={open()}>
        <div
          role="menu"
          class="absolute right-0 top-full z-50 mt-1 min-w-[12rem] rounded-lg border border-stroke bg-white py-1 shadow-lg"
        >
          <For each={props.targets}>
            {(target) => (
              <button
                type="button"
                role="menuitem"
                class="block w-full px-4 py-2 text-left text-sm text-text-primary transition hover:erp-panel"
                onClick={(e) => {
                  e.stopPropagation();
                  void generate(target.targetEntity, target.label);
                }}
              >
                {target.label}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
