import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import { Modal } from "./Modal";
import { inputClass } from "./SpreadsheetGrid";
import { LoadingText } from "../shared/LoadingText";

export type MultiSelectRow = {
  id: number;
  code?: string;
  name: string;
  keyword?: string;
};

type Props = {
  open: boolean;
  title: string;
  searchPlaceholder?: string;
  selectedIds: () => number[];
  fetchRows: (q: string) => Promise<MultiSelectRow[]>;
  onClose: () => void;
  onApply: (ids: number[], rows: MultiSelectRow[]) => void;
  showKeyword?: boolean;
  includeDeactivated?: boolean;
};

export function MultiSelectSearchModal(props: Props) {
  const [q, setQ] = createSignal("");
  const [picked, setPicked] = createSignal<Set<number>>(new Set());
  const [rows] = createResource(q, (query) => props.fetchRows(query));

  createEffect(() => {
    if (props.open) setPicked(new Set(props.selectedIds()));
  });

  const toggle = (id: number) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const list = rows() ?? [];
    const allSelected = list.every((r) => picked().has(r.id));
    setPicked((prev) => {
      const next = new Set(prev);
      for (const r of list) {
        if (allSelected) next.delete(r.id);
        else next.add(r.id);
      }
      return next;
    });
  };

  const apply = () => {
    const ids = [...picked()];
    const selectedRows = (rows() ?? []).filter((r) => picked().has(r.id));
    props.onApply(ids, selectedRows);
  };

  return (
    <Modal open={props.open} title={props.title} onClose={props.onClose} wide>
      <div class="mb-3 flex flex-wrap gap-2">
        <Show when={props.includeDeactivated}>
          <span class="rounded border border-stroke px-2 py-1 text-xs text-text-secondary">Active only</span>
        </Show>
        <input
          class={`${inputClass} min-w-[240px] flex-1`}
          placeholder={props.searchPlaceholder ?? "Search and press Enter"}
          value={q()}
          onInput={(e) => setQ(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setQ(e.currentTarget.value);
          }}
        />
        <button type="button" class="rounded-lg bg-brand-600 px-3 py-2 text-sm text-white" onClick={() => setQ(q())}>
          Search (F3)
        </button>
      </div>
      <Show when={rows.loading}>
        <LoadingText class="text-sm text-text-secondary" as="p" />
      </Show>
      <Show when={!rows.loading && (rows()?.length ?? 0) === 0}>
        <p class="py-8 text-center text-sm text-text-secondary">Please use after Search.</p>
      </Show>
      <div class="max-h-80 overflow-y-auto rounded border border-stroke">
        <table class="min-w-full text-sm">
          <thead class="sticky top-0 bg-slate-50">
            <tr>
              <th class="px-2 py-1">
                <input type="checkbox" onChange={toggleAll} />
              </th>
              <Show when={props.showKeyword !== false}>
                <th class="px-2 py-1 text-left">Code</th>
              </Show>
              <th class="px-2 py-1 text-left">Name</th>
              <Show when={props.showKeyword}>
                <th class="px-2 py-1 text-left">Keyword</th>
              </Show>
            </tr>
          </thead>
          <tbody>
            <For each={rows() ?? []}>
              {(row, i) => (
                <tr class="cursor-pointer hover:bg-slate-50" onClick={() => toggle(row.id)}>
                  <td class="px-2 py-1">
                    <input type="checkbox" checked={picked().has(row.id)} onChange={() => toggle(row.id)} />
                  </td>
                  <Show when={props.showKeyword !== false}>
                    <td class="px-2 py-1">{row.code ?? i() + 1}</td>
                  </Show>
                  <td class="px-2 py-1">{row.name}</td>
                  <Show when={props.showKeyword}>
                    <td class="px-2 py-1">{row.keyword ?? ""}</td>
                  </Show>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
      <div class="mt-4 flex justify-end gap-2">
        <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white" onClick={apply}>
          Apply (F8)
        </button>
        <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={props.onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
