import { createEffect, createSignal, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { LookupCombo, type LookupOption } from "../../shared/LookupCombo";
import { modalDismissClass } from "../../shared/Modal";
import { useToast } from "../../shared/toast";

export type StockEntryType = "transfer" | "issue" | "receipt";
export type StockEntryReasonPreset = "" | "internal_use" | "product_defect";

async function fetchLocations(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; location_name: string }[]>(`/api/v1/inventory/locations?${qs}`);
  return (res.data ?? []).map((l) => ({ id: l.id, label: l.location_name }));
}

async function fetchItems(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; item_code: string; item_name: string }[]>(
    `/api/v1/inventory/items?${qs}`,
  );
  return (res.data ?? []).map((i) => ({ id: i.id, label: `${i.item_code} — ${i.item_name}` }));
}

function titleFor(type: StockEntryType, reason: StockEntryReasonPreset) {
  if (reason === "internal_use") return "Internal Use";
  if (reason === "product_defect") return "Product Defect";
  if (type === "transfer") return "Stock Transfer";
  if (type === "issue") return "Stock Issue";
  return "Stock Receipt";
}

export function StockEntryModal(props: {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  /** Preset entry type when opening from Stock Movements shortcuts. */
  initialType?: StockEntryType;
  /** Preset reason for issue (internal_use / product_defect). */
  initialReason?: StockEntryReasonPreset;
  /** When false, hide the type selector (locked to initialType). */
  lockType?: boolean;
  /** When true (default), create then immediately post. */
  autoPost?: boolean;
}) {
  const toast = useToast();
  const [entryType, setEntryType] = createSignal<StockEntryType>("receipt");
  const [reason, setReason] = createSignal<StockEntryReasonPreset>("");
  const [fromLocId, setFromLocId] = createSignal<number | null>(null);
  const [fromLocLabel, setFromLocLabel] = createSignal("");
  const [toLocId, setToLocId] = createSignal<number | null>(null);
  const [toLocLabel, setToLocLabel] = createSignal("");
  const [itemId, setItemId] = createSignal<number | null>(null);
  const [itemLabel, setItemLabel] = createSignal("");
  const [qty, setQty] = createSignal("1");
  const [creating, setCreating] = createSignal(false);

  createEffect(() => {
    if (!props.open) return;
    setEntryType(props.initialType ?? "receipt");
    setReason(props.initialReason ?? "");
    setFromLocId(null);
    setFromLocLabel("");
    setToLocId(null);
    setToLocLabel("");
    setItemId(null);
    setItemLabel("");
    setQty("1");
  });

  const close = () => props.onClose();

  const createEntry = async () => {
    const iid = itemId();
    const q = Number(qty());
    if (!iid || q <= 0) {
      toast.warning("Select item and quantity.");
      return;
    }
    const type = entryType();
    if ((type === "issue" || type === "transfer") && !fromLocId()) {
      toast.warning("Select source location.");
      return;
    }
    if ((type === "receipt" || type === "transfer") && !toLocId()) {
      toast.warning("Select destination location.");
      return;
    }
    const notes = reason() || undefined;
    setCreating(true);
    const res = await apiFetch<{ id: number; entry_no: string }>("/api/v1/inventory/stock-entries", {
      method: "POST",
      body: JSON.stringify({
        entry_type: type,
        from_location_id: fromLocId() ?? undefined,
        to_location_id: toLocId() ?? undefined,
        notes: notes || undefined,
        lines: [{ item_id: iid, qty: q }],
      }),
    });
    if (!res.success || !res.data?.id) {
      setCreating(false);
      toast.warning(res.message ?? "Failed to create entry.");
      return;
    }
    if (props.autoPost !== false) {
      const postRes = await apiFetch(`/api/v1/inventory/stock-entries/${res.data.id}/post`, { method: "POST" });
      setCreating(false);
      if (!postRes.success) {
        toast.warning(postRes.message ?? "Entry created as draft but post failed. Open Stock Entries to post.");
        props.onCreated?.();
        close();
        return;
      }
      toast.success(`${titleFor(type, reason())} posted (${res.data.entry_no}).`);
    } else {
      setCreating(false);
      toast.success(`Entry ${res.data.entry_no} created.`);
    }
    props.onCreated?.();
    close();
  };

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-[55] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
        <div class="w-full max-w-lg rounded-2xl border border-stroke bg-white p-6 shadow-xl">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-lg font-semibold">{titleFor(entryType(), reason())}</h2>
            <button type="button" class={modalDismissClass} onClick={close}>
              Close
            </button>
          </div>
          <Show when={!props.lockType}>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Type</span>
              <select
                class="mt-1 w-full rounded border border-stroke px-2 py-1.5"
                value={entryType()}
                onChange={(e) => {
                  setEntryType(e.currentTarget.value as StockEntryType);
                  setReason("");
                }}
              >
                <option value="receipt">Receipt</option>
                <option value="issue">Issue</option>
                <option value="transfer">Transfer</option>
              </select>
            </label>
          </Show>
          <Show when={entryType() === "issue" && !props.lockType}>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Reason</span>
              <select
                class="mt-1 w-full rounded border border-stroke px-2 py-1.5"
                value={reason()}
                onChange={(e) => setReason(e.currentTarget.value as StockEntryReasonPreset)}
              >
                <option value="">General issue</option>
                <option value="internal_use">Internal use</option>
                <option value="product_defect">Product defect</option>
              </select>
            </label>
          </Show>
          <Show when={entryType() === "issue" || entryType() === "transfer"}>
            <LookupCombo
              label="From location"
              required
              value={fromLocLabel}
              selectedId={fromLocId}
              onInput={setFromLocLabel}
              onSelect={(o) => {
                setFromLocId(o.id);
                setFromLocLabel(o.label);
              }}
              onClear={() => {
                setFromLocId(null);
                setFromLocLabel("");
              }}
              fetchOptions={fetchLocations}
            />
          </Show>
          <Show when={entryType() === "receipt" || entryType() === "transfer"}>
            <div class="mt-3">
              <LookupCombo
                label="To location"
                required
                value={toLocLabel}
                selectedId={toLocId}
                onInput={setToLocLabel}
                onSelect={(o) => {
                  setToLocId(o.id);
                  setToLocLabel(o.label);
                }}
                onClear={() => {
                  setToLocId(null);
                  setToLocLabel("");
                }}
                fetchOptions={fetchLocations}
              />
            </div>
          </Show>
          <div class="mt-3">
            <LookupCombo
              label="Item"
              required
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
          </div>
          <label class="mt-3 block text-sm">
            <span class="text-text-secondary">Quantity</span>
            <input
              type="number"
              class="mt-1 w-full rounded border border-stroke px-2 py-1"
              min="0"
              value={qty()}
              onInput={(e) => setQty(e.currentTarget.value)}
            />
          </label>
          <div class="mt-6 flex justify-end gap-2">
            <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              disabled={creating()}
              onClick={() => void createEntry()}
            >
              {creating() ? "Saving…" : props.autoPost === false ? "Create" : "Create & post"}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
