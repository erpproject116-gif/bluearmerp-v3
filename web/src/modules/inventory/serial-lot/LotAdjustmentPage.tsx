import { createEffect, createSignal, For, on, onMount, untrack } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { CollapsibleFilterPanel } from "../../../shared/CollapsibleFilterPanel";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";
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
  const [draft, setDraft] = createSignal<LotAdjustmentFilters>(defaultFilters());
  const [submitted, setSubmitted] = createSignal<LotAdjustmentFilters>(defaultFilters());
  const [page, setPage] = createSignal(1);
  const [editableRows, setEditableRows] = createSignal<EditableRow[]>([]);
  const [reason, setReason] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [itemId, setItemId] = createSignal<number | null>(null);
  const [itemLabel, setItemLabel] = createSignal("");
  const [locationId, setLocationId] = createSignal<number | null>(null);
  const [locationLabel, setLocationLabel] = createSignal("");
  const [pageSize] = createSignal(20);

  const list = useLotAdjustmentCandidates(() => {
    const f = submitted();
    return {
      page: page(),
      pageSize: pageSize(),
      sort: "lot_no",
      order: "asc" as const,
      filters: {
        ...f,
        item_id: f.item_id ?? itemId() ?? undefined,
        location_id: f.location_id ?? locationId() ?? undefined,
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
      },
    ),
  );

  const patch = (p: Partial<LotAdjustmentFilters>) => setDraft((prev) => ({ ...prev, ...p }));

  const search = () => {
    setSubmitted({
      ...draft(),
      item_id: itemId() ?? undefined,
      location_id: locationId() ?? undefined,
    });
    setPage(1);
    setEditableRows([]);
  };

  const reset = () => {
    setDraft(defaultFilters());
    setSubmitted(defaultFilters());
    setPage(1);
    setEditableRows([]);
    setReason("");
    setItemId(null);
    setItemLabel("");
    setLocationId(null);
    setLocationLabel("");
    invalidate();
  };

  const updateDelta = (id: number, value: string) => {
    setEditableRows((rows) =>
      rows.map((r) => (r.id === id ? { ...r, edit_qty_delta: value, dirty: true } : r)),
    );
  };

  const save = async () => {
    const lines = editableRows()
      .map((r) => ({ lot_batch_id: r.id, qty_delta: Number(r.edit_qty_delta) || 0 }))
      .filter((l) => l.qty_delta !== 0);
    if (!reason().trim()) {
      toast.warning("Enter an adjustment reason.");
      return;
    }
    if (lines.length === 0) {
      toast.warning("Enter qty delta on at least one lot row.");
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
        title="Inventory adjustment by lot"
        description="Search lot batches, enter qty delta (+/−), then apply."
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

      <section class="mt-6 rounded-xl border border-stroke bg-white p-5 shadow-sm">
          <Field label="Reason (required)">
            <input class={inputClass} value={reason()} onInput={(e) => setReason(e.currentTarget.value)} />
          </Field>
          <div class="mt-4 overflow-x-auto">
            <table class="erp-grid min-w-full text-left text-sm">
              <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
                <tr>
                  <th class="px-3 py-2">Lot no.</th>
                  <th class="px-3 py-2">Item</th>
                  <th class="px-3 py-2">Location</th>
                  <th class="px-3 py-2 text-right">On hand</th>
                  <th class="px-3 py-2 text-right">Qty delta</th>
                </tr>
              </thead>
              <tbody>
                <For each={editableRows()}>
                  {(row) => (
                    <tr class="border-t border-stroke/60">
                      <td class="px-3 py-2">{row.lot_no}</td>
                      <td class="px-3 py-2">{row.item_code}</td>
                      <td class="px-3 py-2">{row.location_name}</td>
                      <td class="px-3 py-2 text-right">{row.qty_on_hand}</td>
                      <td class="px-3 py-2 text-right">
                        <input
                          class={`${inputClass} w-28 text-right`}
                          type="number"
                          step="any"
                          value={row.edit_qty_delta}
                          onInput={(e) => updateDelta(row.id, e.currentTarget.value)}
                        />
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
          <div class="mt-4 flex justify-end">
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              disabled={saving()}
              onClick={() => void save()}
            >
              {saving() ? "Saving…" : "Apply adjustments"}
            </button>
          </div>
      </section>
    </SerialLotLayout>
  );
}
