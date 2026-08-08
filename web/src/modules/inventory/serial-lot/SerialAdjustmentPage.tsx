import { createEffect, createSignal, For, on, onMount, Show, untrack } from "solid-js";
import { CollapsibleFilterPanel } from "../../../shared/CollapsibleFilterPanel";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";
import { apiFetch } from "../../../shared/api";
import { DateInput } from "../../../shared/DateInput";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { submitEntity } from "../../../shared/handleSaveResult";
import { useToast } from "../../../shared/toast";
import {
  applySerialAdjustments,
  useSerialAdjustmentCandidates,
  type SerialAdjustmentCandidate,
  type SerialAdjustmentFilters,
} from "../../../shared/useSerialAdjustment";
import { useInvalidateSerialLotLists } from "../../../shared/useSerialLotList";
import { SerialLotLayout } from "./SerialLotLayout";
import { SERIAL_STATUS_OPTIONS, serialStatusLabel } from "./serialRegistryFilters";

const INVENTORY_QTY_OPTIONS = [
  { value: "", label: "All" },
  { value: "1", label: "1" },
  { value: "0", label: "0" },
  { value: "others", label: "Others" },
];

type EditableRow = SerialAdjustmentCandidate & {
  edit_qty_delta: string;
  dirty: boolean;
};

function defaultFilters(): SerialAdjustmentFilters {
  return {
    q: "",
    serial_no: "",
    status: "",
    item_id: undefined,
    location_id: undefined,
    validity_from: "",
    validity_to: "",
    inventory_qty: "",
    include_unassigned: true,
  };
}

function initEditable(rows: SerialAdjustmentCandidate[]): EditableRow[] {
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

export default function SerialAdjustmentPage() {
  const toast = useToast();
  const invalidate = useInvalidateSerialLotLists();
  const [draft, setDraft] = createSignal<SerialAdjustmentFilters>(defaultFilters());
  const [submitted, setSubmitted] = createSignal<SerialAdjustmentFilters>(defaultFilters());
  const [page, setPage] = createSignal(1);
  const sort = () => "serial_no" as const;
  const order = () => "asc" as const;
  const [editableRows, setEditableRows] = createSignal<EditableRow[]>([]);
  const [reason, setReason] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [itemId, setItemId] = createSignal<number | null>(null);
  const [itemLabel, setItemLabel] = createSignal("");
  const [locationId, setLocationId] = createSignal<number | null>(null);
  const [locationLabel, setLocationLabel] = createSignal("");
  const pageSize = 25;

  const list = useSerialAdjustmentCandidates(() => {
    const f = submitted();
    return {
      page: page(),
      pageSize,
      sort: sort(),
      order: order(),
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

  const patch = (p: Partial<SerialAdjustmentFilters>) => setDraft((prev) => ({ ...prev, ...p }));

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

  const updateQtyDelta = (id: number, value: string) => {
    setEditableRows((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, edit_qty_delta: value, dirty: value !== "" && value !== "0" } : r,
      ),
    );
  };

  const save = async () => {
    const lines = editableRows()
      .filter((r) => r.dirty)
      .map((r) => ({ serial_unit_id: r.id, qty_delta: Number(r.edit_qty_delta) }))
      .filter((l) => !Number.isNaN(l.qty_delta) && l.qty_delta !== 0);
    if (!reason().trim()) {
      toast.warning("Reason is required.");
      return;
    }
    if (lines.length === 0) {
      toast.warning("Enter at least one non-zero quantity change.");
      return;
    }
    setSaving(true);
    const ok = await submitEntity(
      () => applySerialAdjustments({ reason: reason().trim(), lines }),
      toast,
      "Serials adjusted.",
    );
    setSaving(false);
    if (!ok) return;
    setEditableRows([]);
    invalidate();
    search();
  };

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F8") {
        e.preventDefault();
        if (e.shiftKey) void save();
        else search();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const displayRows = () => (editableRows().length ? editableRows() : initEditable(list.data?.rows ?? []));

  return (
    <SerialLotLayout>
      <CollapsibleFilterPanel
        title="Inventory adj. by serial / lot"
        description="Search serial units, enter qty changes, then Save (Shift+F8)."
        actions={
          <>
            <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700" onClick={search}>
              Search (F8)
            </button>
            <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm text-text-secondary hover:bg-slate-50" onClick={reset}>
              Reset
            </button>
          </>
        }
      >
        <div class="grid gap-4 md:grid-cols-2">
          <Field label="Terms of validity — from">
            <DateInput value={draft().validity_from ?? ""} onInput={(e) => patch({ validity_from: e.currentTarget.value })} />
          </Field>
          <Field label="Terms of validity — to">
            <DateInput value={draft().validity_to ?? ""} onInput={(e) => patch({ validity_to: e.currentTarget.value })} />
          </Field>
          <Field label="Serial / lot no.">
            <input class={inputClass} value={draft().serial_no ?? ""} onInput={(e) => patch({ serial_no: e.currentTarget.value })} />
          </Field>
          <Field label="Inventory qty">
            <select class={inputClass} value={draft().inventory_qty ?? ""} onChange={(e) => patch({ inventory_qty: e.currentTarget.value || undefined })}>
              {INVENTORY_QTY_OPTIONS.map((o) => (
                <option value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
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
          <Field label="Status">
            <select class={inputClass} value={draft().status ?? ""} onChange={(e) => patch({ status: e.currentTarget.value || undefined })}>
              {SERIAL_STATUS_OPTIONS.map((o) => (
                <option value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Include unassigned locations">
            <label class="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft().include_unassigned ?? false}
                onChange={(e) => patch({ include_unassigned: e.currentTarget.checked })}
              />
              Include serials without a location
            </label>
          </Field>
        </div>
      </CollapsibleFilterPanel>

      <section class="mt-6 rounded-xl border border-stroke bg-white shadow-sm">
          <div class="border-b border-stroke px-4 py-3">
            <Field label="Adjustment reason *">
              <input class={inputClass} value={reason()} onInput={(e) => setReason(e.currentTarget.value)} placeholder="Cycle count, correction…" />
            </Field>
          </div>
          <div class="overflow-x-auto">
            <table class="erp-grid min-w-full text-left text-sm">
              <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
                <tr>
                  <th class="px-3 py-2">Serial no.</th>
                  <th class="px-3 py-2">Item</th>
                  <th class="px-3 py-2">Location</th>
                  <th class="px-3 py-2 text-right">Inv qty</th>
                  <th class="px-3 py-2">Status</th>
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
                  <For each={displayRows()}>
                    {(row) => (
                      <tr class="border-t border-stroke">
                        <td class="px-3 py-2 font-mono text-xs">{row.serial_no}</td>
                        <td class="px-3 py-2">
                          {row.item_code} — {row.item_name}
                        </td>
                        <td class="px-3 py-2">{row.location_name || "—"}</td>
                        <td class="px-3 py-2 text-right">{row.qty_on_hand}</td>
                        <td class="px-3 py-2">{serialStatusLabel(row.status)}</td>
                        <td class="px-3 py-2 text-right">
                          <input
                            type="number"
                            step="1"
                            class={`${inputClass} w-24 text-right`}
                            value={row.edit_qty_delta}
                            placeholder="±1"
                            onInput={(e) => updateQtyDelta(row.id, e.currentTarget.value)}
                          />
                        </td>
                      </tr>
                    )}
                  </For>
                  <Show when={displayRows().length === 0}>
                    <tr>
                      <td colSpan={6} class="px-3 py-6 text-center text-slate-500">
                        No serial units match the filters.
                      </td>
                    </tr>
                  </Show>
                </Show>
              </tbody>
            </table>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-2 border-t border-stroke px-4 py-3">
            <p class="text-xs text-text-secondary">
              Page {page()} · {list.data?.total ?? 0} total
            </p>
            <div class="flex gap-2">
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
                disabled={page() * pageSize >= (list.data?.total ?? 0)}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
              <button
                type="button"
                class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                disabled={saving() || editableRows().filter((r) => r.dirty).length === 0}
                onClick={() => void save()}
              >
                {saving() ? "Saving…" : "Save (Shift+F8)"}
              </button>
            </div>
          </div>
      </section>
    </SerialLotLayout>
  );
}
