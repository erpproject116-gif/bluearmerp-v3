import { For, Show } from "solid-js";

export type SoldSerialUnit = { id: number; serial_no: string };

type Props = {
  soldUnits: SoldSerialUnit[];
  returnQty: number;
  selectedIds: number[];
  serialPolicy?: string;
  disabled?: boolean;
  onChange: (ids: number[]) => void;
};

export function ReturnSerialPicker(props: Props) {
  const target = () => Math.max(0, Math.floor(props.returnQty));
  const required = () => (props.serialPolicy ?? "required") !== "optional";

  const toggle = (id: number) => {
    if (props.disabled) return;
    const cur = props.selectedIds;
    if (cur.includes(id)) {
      props.onChange(cur.filter((x) => x !== id));
      return;
    }
    if (target() > 0 && cur.length >= target()) return;
    props.onChange([...cur, id]);
  };

  return (
    <div class="mt-1 space-y-1 text-left">
      <p class="text-[10px] uppercase tracking-wide text-text-secondary">
        Return serials · {props.selectedIds.length}/{target() || "—"}
        {required() ? " · required" : " · optional"}
      </p>
      <Show
        when={props.soldUnits.length > 0}
        fallback={<p class="text-xs text-amber-700">No sold serials on this line.</p>}
      >
        <div class="flex flex-wrap gap-1">
          <For each={props.soldUnits}>
            {(u) => {
              const selected = () => props.selectedIds.includes(u.id);
              const full = () => target() > 0 && props.selectedIds.length >= target() && !selected();
              return (
                <button
                  type="button"
                  class={`rounded border px-2 py-0.5 text-xs ${
                    selected()
                      ? "border-brand-600 bg-brand-50 text-brand-800"
                      : full()
                        ? "border-stroke text-text-secondary opacity-50"
                        : "border-stroke hover:bg-slate-50"
                  }`}
                  disabled={props.disabled || full()}
                  onClick={() => toggle(u.id)}
                >
                  {u.serial_no}
                </button>
              );
            }}
          </For>
        </div>
      </Show>
      <Show when={required() && target() > 0 && props.selectedIds.length !== target()}>
        <p class="text-xs text-amber-700">Select {target()} serial{target() === 1 ? "" : "s"} for this return.</p>
      </Show>
    </div>
  );
}
