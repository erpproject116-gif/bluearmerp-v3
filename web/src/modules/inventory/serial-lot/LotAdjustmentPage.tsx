import { createEffect, createMemo, createSignal, For, on, onMount, Show, untrack } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { apiFetch } from "../../../shared/api";
import { CollapsibleFilterPanel } from "../../../shared/CollapsibleFilterPanel";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";
import { PageSizeSelect } from "../../../shared/pageSize";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { submitEntity } from "../../../shared/handleSaveResult";
import { useToast } from "../../../shared/toast";
import {
  applyLotAdjustments,
  useLotAdjustmentCandidates,
  type LotAdjustmentCandidate,
  type LotAdjustmentFilters,
} from "../../../shared/useLotAdjustment";
import { useInvalidateSerialLotLists } from "../../../shared/useSerialLotList";
import { SerialLotLayout } from "./SerialLotLayout";

type EditableRow = LotAdjustmentCandidate & {
  edit_qty_delta: string;
  dirty: boolean;
};

function defaultFilters(): LotAdjustmentFilters {
  return { q: "" };
}

function initEditable(rows: LotAdjustmentCandidate[]): EditableRow[] {
  return rows.map((r) => ({ ...r, edit_qty_delta: "", dirty: false }));
}

function parseQtyChange(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}

async function fetchItems(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; item_code: string; item_name: string }[]>(`/api/v1/inventory/items?${qs}`);
  return (res.data ?? []).map((i) => ({ id: i.id, label: `${i.item_code} — ${i.item_name}` }));
}

async function fetchLocations(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; location_name: string }[]>(`/api/v1/inventory/locations?${qs}`);
  return (res.data ?? []).map((l) => ({ id: l.id, label: l.location_name }));
}

export default function LotAdjustmentPage() {
  const toast = useToast();
  const invalidate = useInvalidateSerialLotLists();
  const [searchParams] = useSearchParams();
  const presetQuery = () => String(searchParams.q ?? "").trim();
  const initialFilters = (): LotAdjustmentFilters => ({ q: presetQuery() });
  const [draft, setDraft] = createSignal<LotAdjustmentFilters>(initialFilters());
  const [submitted, setSubmitted] = createSignal<LotAdjustmentFilters>(initialFilters());
  const [page, setPage] = createSignal(1);
  const [editableRows, setEditableRows] = createSignal<EditableRow[]>([]);
  const [selectedIds, setSelectedIds] = createSignal<Set<number>>(new Set());
  const [reason, setReason] = createSignal("");
  const [bulkChange, setBulkChange] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [itemId, setItemId] = createSignal<number | null>(null);
  const [itemLabel, setItemLabel] = createSignal("");
  const [locationId, setLocationId] = createSignal<number | null>(null);
  const [locationLabel, setLocationLabel] = createSignal("");
  const [pageSize, setPageSize] = createSignal(20);

  const list = useLotAdjustmentCandidates(() => {
    const f = submitted();
    return {
      page: page(),
      pageSize: pageSize(),
      sort: "lot_no",
      order: "asc" as const,
      filters: {
        q: f.q,
        item_id: f.item_id,
        location_id: f.location_id,
      },
      enabled: true,
    };
  });

  // `on` restricts the dependency to fetched rows; reading editableRows via
  // untrack avoids the write-triggers-own-effect infinite loop (stack overflow).
  createEffect(
    on(
      () => list.data?.rows,
      (incoming) => {
        if (untrack(editableRows).some((r) => r.dirty)) return;
        setEditableRows(initEditable(incoming ?? []));
        setSelectedIds(new Set());
      },
    ),
  );

  const keepRowsForReload = () => {
    setEditableRows((rows) => rows.map((r) => ({ ...r, dirty: false })));
    setSelectedIds(new Set());
  };

  createEffect(() => {
    const q = presetQuery();
    setDraft((prev) => (prev.q === q ? prev : { ...prev, q }));
    setSubmitted((prev) => (prev.q === q ? prev : { ...prev, q }));
  });

  const patch = (p: Partial<LotAdjustmentFilters>) => setDraft((prev) => ({ ...prev, ...p }));

  const search = () => {
    setSubmitted({
      ...draft(),
      item_id: itemId() ?? undefined,
      location_id: locationId() ?? undefined,
    });
    setPage(1);
    keepRowsForReload();
    invalidate();
  };

  const reset = () => {
    setDraft(defaultFilters());
    setSubmitted(defaultFilters());
    setPage(1);
    setReason("");
    setBulkChange("");
    setItemId(null);
    setItemLabel("");
    setLocationId(null);
    setLocationLabel("");
    keepRowsForReload();
    invalidate();
  };

  const updateDelta = (id: number, value: string) => {
    setEditableRows((rows) =>
      rows.map((r) => (r.id === id ? { ...r, edit_qty_delta: value, dirty: true } : r)),
    );
  };

  const pageIds = createMemo(() => editableRows().map((r) => r.id));
  const selectedCount = createMemo(() => selectedIds().size);
  const allPageSelected = createMemo(() => {
    const ids = pageIds();
    if (ids.length === 0) return false;
    const sel = selectedIds();
    return ids.every((id) => sel.has(id));
  });

  const toggleRow = (id: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAllPage = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of pageIds()) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const fillSelectedChange = () => {
    const value = bulkChange().trim();
    if (!value) {
      toast.warning("Enter a qty change to apply to selected lots.");
      return;
    }
    const sel = selectedIds();
    if (sel.size === 0) {
      toast.warning("Select at least one lot first.");
      return;
    }
    setEditableRows((rows) =>
      rows.map((r) => (sel.has(r.id) ? { ...r, edit_qty_delta: value, dirty: true } : r)),
    );
  };

  const save = async () => {
    if (!reason().trim()) {
      toast.warning("Enter an adjustment reason.");
      return;
    }
    const sel = selectedIds();
    const lines: { lot_batch_id: number; qty_delta: number }[] = [];
    for (const r of editableRows()) {
      if (!sel.has(r.id)) continue;
      const qty = parseQtyChange(r.edit_qty_delta);
      if (qty === null) continue;
      lines.push({ lot_batch_id: r.id, qty_delta: qty });
    }
    if (lines.length === 0) {
      toast.warning("Select lots and enter a non-zero qty change on at least one selected row.");
      return;
    }
    setSaving(true);
    const ok = await submitEntity(
      () => applyLotAdjustments({ reason: reason().trim(), lines }),
      toast,
      "Lot quantities adjusted.",
    );
    setSaving(false);
    if (!ok) return;
    invalidate();
    search();
    setReason("");
    setBulkChange("");
  };

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F8") {
        e.preventDefault();
        search();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <SerialLotLayout>
      <CollapsibleFilterPanel
        title="Find lots"
        description="Search by lot or item, then enter how much to add or remove on each selected lot."
        actions={
          <>
            <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white" onClick={search}>
              Search (F8)
            </button>
            <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={reset}>
              Reset
            </button>
          </>
        }
      >
        <div class="grid gap-4 md:grid-cols-2">
          <Field label="Keyword">
            <input
              class={inputClass}
              value={draft().q ?? ""}
              onInput={(e) => patch({ q: e.currentTarget.value })}
              placeholder="Lot no., item…"
            />
          </Field>
          <LookupCombo
            label="Item"
            value={itemLabel}
            selectedId={itemId}
            onInput={setItemLabel}
            onSelect={(o) => {
              setItemId(o.id);
              setItemLabel(o.label);
            }}
            onClear={() => {
              setItemId(null);
              setItemLabel("");
            }}
            fetchOptions={fetchItems}
          />
          <LookupCombo
            label="Location"
            value={locationLabel}
            selectedId={locationId}
            onInput={setLocationLabel}
            onSelect={(o) => {
              setLocationId(o.id);
              setLocationLabel(o.label);
            }}
            onClear={() => {
              setLocationId(null);
              setLocationLabel("");
            }}
            fetchOptions={fetchLocations}
          />
        </div>
      </CollapsibleFilterPanel>

      <section class="mt-6 rounded-xl border border-stroke bg-white shadow-sm">
        <div class="border-b border-stroke px-4 py-3">
          <Field label="Reason (required)">
            <input
              class={inputClass}
              value={reason()}
              onInput={(e) => setReason(e.currentTarget.value)}
              placeholder="Cycle count, correction…"
            />
          </Field>
          <div class="mt-3 flex flex-wrap items-end gap-2">
            <Field label="Qty change for selected">
              <input
                class={`${inputClass} w-28`}
                type="text"
                inputMode="decimal"
                value={bulkChange()}
                placeholder="+2 or -1"
                onInput={(e) => setBulkChange(e.currentTarget.value)}
              />
            </Field>
            <button
              type="button"
              class="rounded-lg border border-stroke px-3 py-2 text-sm font-medium text-text-secondary hover:bg-slate-50"
              onClick={fillSelectedChange}
            >
              Set change on selected
            </button>
            <p class="pb-2 text-xs text-text-secondary">{selectedCount()} selected</p>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="erp-grid min-w-full text-left text-sm">
            <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
              <tr>
                <th class="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    class="h-4 w-4"
                    checked={allPageSelected()}
                    disabled={editableRows().length === 0}
                    aria-label="Select all lots on this page"
                    onChange={(e) => toggleAllPage(e.currentTarget.checked)}
                  />
                </th>
                <th class="px-3 py-2">Lot no.</th>
                <th class="px-3 py-2">Item</th>
                <th class="px-3 py-2">Location</th>
                <th class="px-3 py-2 text-right">On hand</th>
                <th class="px-3 py-2 text-right">Qty change</th>
              </tr>
            </thead>
            <tbody>
              <Show when={list.isFetching}>
                <tr>
                  <td colSpan={6} class="px-3 py-6 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              </Show>
              <Show when={!list.isFetching}>
                <For each={editableRows()}>
                  {(row) => (
                    <tr class="border-t border-stroke/60">
                      <td class="px-3 py-2">
                        <input
                          type="checkbox"
                          class="h-4 w-4"
                          checked={selectedIds().has(row.id)}
                          aria-label={`Select lot ${row.lot_no}`}
                          onChange={(e) => toggleRow(row.id, e.currentTarget.checked)}
                        />
                      </td>
                      <td class="px-3 py-2">{row.lot_no}</td>
                      <td class="px-3 py-2">{row.item_code}</td>
                      <td class="px-3 py-2">{row.location_name}</td>
                      <td class="px-3 py-2 text-right">{row.qty_on_hand}</td>
                      <td class="px-3 py-2 text-right">
                        <input
                          class={`${inputClass} w-28 text-right`}
                          type="text"
                          inputMode="decimal"
                          value={row.edit_qty_delta}
                          placeholder="+/−"
                          onInput={(e) => updateDelta(row.id, e.currentTarget.value)}
                        />
                      </td>
                    </tr>
                  )}
                </For>
                <Show when={editableRows().length === 0}>
                  <tr>
                    <td colSpan={6} class="px-3 py-6 text-center text-slate-500">
                      No lots match the filters.
                    </td>
                  </tr>
                </Show>
              </Show>
            </tbody>
          </table>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-2 border-t border-stroke px-4 py-3">
          <p class="text-xs text-text-secondary">
            Page {page()} · {list.data?.total ?? 0} total · {selectedCount()} selected
          </p>
          <div class="flex flex-wrap gap-2">
            <PageSizeSelect
              value={pageSize()}
              onChange={(n) => {
                setPageSize(n);
                setPage(1);
              }}
            />
            <button
              type="button"
              class="rounded-lg border border-stroke px-3 py-1.5 text-sm disabled:opacity-50"
              disabled={page() <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <button
              type="button"
              class="rounded-lg border border-stroke px-3 py-1.5 text-sm disabled:opacity-50"
              disabled={page() * pageSize() >= (list.data?.total ?? 0)}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              disabled={saving()}
              onClick={() => void save()}
            >
              {saving() ? "Saving…" : "Apply adjustments"}
            </button>
          </div>
        </div>
      </section>
    </SerialLotLayout>
  );
}
