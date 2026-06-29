import { createEffect, createSignal, For, Show } from "solid-js";
import { Modal } from "./Modal";
import { inputClass } from "./SpreadsheetGrid";
import { fetchAvailableSerials, type AvailableSerial } from "./useReleaseQueue";

type Props = {
  open: boolean;
  itemId: number | null;
  locationId?: number | null;
  maxQty: number;
  selectedIds: number[];
  itemLabel?: string;
  onClose: () => void;
  onConfirm: (ids: number[], serials: AvailableSerial[]) => void;
};

export function SerialPickModal(props: Props) {
  const [loading, setLoading] = createSignal(false);
  const [serials, setSerials] = createSignal<AvailableSerial[]>([]);
  const [picked, setPicked] = createSignal<Set<number>>(new Set());
  const [filter, setFilter] = createSignal("");

  const maxSelectable = () => Math.max(1, Math.floor(props.maxQty));

  createEffect(() => {
    if (!props.open || !props.itemId) return;
    setPicked(new Set(props.selectedIds));
    setFilter("");
    setLoading(true);
    void fetchAvailableSerials(props.itemId, props.locationId ?? undefined)
      .then((rows) => setSerials(rows))
      .finally(() => setLoading(false));
  });

  const filtered = () => {
    const q = filter().trim().toLowerCase();
    if (!q) return serials();
    return serials().filter(
      (s) =>
        s.serial_no.toLowerCase().includes(q) ||
        (s.location_name ?? "").toLowerCase().includes(q) ||
        s.status.toLowerCase().includes(q),
    );
  };

  const toggle = (id: number) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        return next;
      }
      if (next.size >= maxSelectable()) return next;
      next.add(id);
      return next;
    });
  };

  const apply = () => {
    const ids = [...picked()];
    const selected = serials().filter((s) => picked().has(s.id));
    props.onConfirm(ids, selected);
    props.onClose();
  };

  return (
    <Modal
      open={props.open}
      title={`Pick serials${props.itemLabel ? ` — ${props.itemLabel}` : ""}`}
      onClose={props.onClose}
      wide
    >
      <p class="mb-3 text-sm text-text-secondary">
        Select up to {maxSelectable()} serial{maxSelectable() === 1 ? "" : "s"} ({picked().size} selected).
      </p>
      <input
        class={`${inputClass} mb-3 w-full`}
        placeholder="Filter by serial no., location, status…"
        value={filter()}
        onInput={(e) => setFilter(e.currentTarget.value)}
      />
      <Show when={loading()}>
        <p class="text-sm text-text-secondary">Loading available serials…</p>
      </Show>
      <Show when={!loading() && serials().length === 0}>
        <p class="py-8 text-center text-sm text-text-secondary">No serials available at this location.</p>
      </Show>
      <Show when={!loading() && serials().length > 0}>
        <div class="max-h-80 overflow-y-auto rounded border border-stroke">
          <table class="min-w-full text-sm">
            <thead class="sticky top-0 bg-slate-50">
              <tr>
                <th class="px-2 py-1 w-10" />
                <th class="px-2 py-1 text-left">Serial no.</th>
                <th class="px-2 py-1 text-left">Status</th>
                <th class="px-2 py-1 text-left">Location</th>
                <th class="px-2 py-1 text-left">Warranty end</th>
              </tr>
            </thead>
            <tbody>
              <For each={filtered()}>
                {(row) => {
                  const selected = () => picked().has(row.id);
                  const atLimit = () => !selected() && picked().size >= maxSelectable();
                  return (
                    <tr
                      class={`cursor-pointer hover:bg-slate-50 ${atLimit() ? "opacity-50" : ""}`}
                      onClick={() => {
                        if (!atLimit()) toggle(row.id);
                      }}
                    >
                      <td class="px-2 py-1">
                        <input
                          type="checkbox"
                          checked={selected()}
                          disabled={atLimit()}
                          onChange={() => toggle(row.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td class="px-2 py-1 font-medium">{row.serial_no}</td>
                      <td class="px-2 py-1 capitalize">{row.status}</td>
                      <td class="px-2 py-1">{row.location_name ?? "—"}</td>
                      <td class="px-2 py-1">{row.warranty_end ?? "—"}</td>
                    </tr>
                  );
                }}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
      <div class="mt-4 flex justify-end gap-2">
        <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={props.onClose}>
          Cancel
        </button>
        <button
          type="button"
          class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          disabled={picked().size === 0}
          onClick={apply}
        >
          Apply ({picked().size})
        </button>
      </div>
    </Modal>
  );
}
