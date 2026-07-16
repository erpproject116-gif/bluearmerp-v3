import { createSignal, onMount, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { DateInput } from "../../../shared/DateInput";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";
import { Modal } from "../../../shared/Modal";
import { DecimalInput } from "../../../shared/DecimalInput";
import { Field, SpreadsheetGrid, inputClass } from "../../../shared/SpreadsheetGrid";
import { ActivityHistoryLink } from "../../../shared/ActivityHistoryLink";
import { submitEntity } from "../../../shared/handleSaveResult";
import { parseNum } from "../../../shared/money";
import { useToast } from "../../../shared/toast";
import { registerLotBatch } from "../../../shared/useLotAdjustment";
import {
  useInvalidateSerialLotLists,
  useLotBatchList,
  type LotBatchRow,
} from "../../../shared/useSerialLotList";
import { SerialLotLayout } from "./SerialLotLayout";

type LotFilters = {
  q?: string;
  item_id?: number | null;
  location_id?: number | null;
};

function defaultLotFilters(): LotFilters {
  return { q: "", item_id: null, location_id: null };
}

async function fetchLocations(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; location_name: string }[]>(`/api/v1/inventory/locations?${qs}`);
  return (res.data ?? []).map((l) => ({ id: l.id, label: l.location_name }));
}

async function fetchItems(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; item_code: string; item_name: string }[]>(`/api/v1/inventory/items?${qs}`);
  return (res.data ?? []).map((i) => ({ id: i.id, label: `${i.item_code} — ${i.item_name}`, sublabel: i.item_code }));
}

export default function LotBatchesListPage() {
  const toast = useToast();
  const invalidate = useInvalidateSerialLotLists();

  const [registerOpen, setRegisterOpen] = createSignal(false);
  const [regLotNo, setRegLotNo] = createSignal("");
  const [regQty, setRegQty] = createSignal("");
  const [regExpiry, setRegExpiry] = createSignal("");
  const [regItemId, setRegItemId] = createSignal<number | null>(null);
  const [regItemLabel, setRegItemLabel] = createSignal("");
  const [regLocationId, setRegLocationId] = createSignal<number | null>(null);
  const [regLocationLabel, setRegLocationLabel] = createSignal("");
  const [regSaving, setRegSaving] = createSignal(false);

  const [draftFilters, setDraftFilters] = createSignal<LotFilters>(defaultLotFilters());
  const [submittedFilters, setSubmittedFilters] = createSignal<LotFilters | null>(null);
  const [locationLabel, setLocationLabel] = createSignal("");
  const [itemLabel, setItemLabel] = createSignal("");
  const [page, setPage] = createSignal(1);
  const [sort, setSort] = createSignal("updated_at");
  const [order, setOrder] = createSignal<"asc" | "desc">("desc");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const pageSize = 25;

  const list = useLotBatchList(() => {
    const f = submittedFilters();
    return {
      page: page(),
      pageSize,
      sort: sort(),
      order: order(),
      q: f?.q || undefined,
      item_id: f?.item_id ?? undefined,
      location_id: f?.location_id ?? undefined,
      enabled: f != null,
    };
  });

  const patch = (p: Partial<LotFilters>) => setDraftFilters((prev) => ({ ...prev, ...p }));

  const search = () => {
    setSubmittedFilters({ ...draftFilters() });
    setPage(1);
    invalidate();
  };

  const reset = () => {
    setDraftFilters(defaultLotFilters());
    setSubmittedFilters(null);
    setLocationLabel("");
    setItemLabel("");
    setPage(1);
  };

  const toggleSort = (key: string) => {
    if (sort() === key) setOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setOrder("asc");
    }
  };

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F8") {
        e.preventDefault();
        search();
      }
      if (e.key === "F2") {
        e.preventDefault();
        setRegisterOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const saveRegister = async () => {
    if (!regItemId() || !regLocationId() || !regLotNo().trim()) {
      toast.warning("Item, location, and lot number are required.");
      return;
    }
    const qty = parseNum(regQty());
    if (qty <= 0) {
      toast.warning("Enter a positive quantity.");
      return;
    }
    setRegSaving(true);
    const ok = await submitEntity(
      () =>
        registerLotBatch({
          item_id: regItemId()!,
          location_id: regLocationId()!,
          lot_no: regLotNo().trim(),
          qty,
          expiry_date: regExpiry() || null,
        }),
      toast,
      "Lot registered.",
    );
    setRegSaving(false);
    if (!ok) return;
    setRegisterOpen(false);
    setRegLotNo("");
    setRegQty("");
    setRegExpiry("");
    invalidate();
    search();
  };

  return (
    <SerialLotLayout>
      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <div class="mb-4">
          <p class="text-sm text-text-secondary">Set filters, then Search (F8).</p>
        </div>
        <div class="grid gap-4 md:grid-cols-2">
          <Field label="Keyword">
            <input
              class={inputClass}
              value={draftFilters().q ?? ""}
              onInput={(e) => patch({ q: e.currentTarget.value })}
              placeholder="Lot no., item code, item name…"
            />
          </Field>
          <LookupCombo
            label="Item"
            value={itemLabel}
            selectedId={() => draftFilters().item_id ?? null}
            onInput={setItemLabel}
            onSelect={(o) => {
              patch({ item_id: o.id });
              setItemLabel(o.label);
            }}
            onClear={() => {
              patch({ item_id: null });
              setItemLabel("");
            }}
            fetchOptions={fetchItems}
          />
          <LookupCombo
            label="Location"
            value={locationLabel}
            selectedId={() => draftFilters().location_id ?? null}
            onInput={setLocationLabel}
            onSelect={(o) => {
              patch({ location_id: o.id });
              setLocationLabel(o.label);
            }}
            onClear={() => {
              patch({ location_id: null });
              setLocationLabel("");
            }}
            fetchOptions={fetchLocations}
          />
        </div>
        <div class="mt-4 flex flex-wrap gap-2 border-t border-stroke pt-4">
          <button
            type="button"
            class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            onClick={search}
          >
            Search (F8)
          </button>
          <button
            type="button"
            class="rounded-lg border border-stroke px-4 py-2 text-sm text-text-secondary hover:bg-slate-50"
            onClick={reset}
          >
            Reset
          </button>
          <button
            type="button"
            class="rounded-lg border border-brand-300 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
            onClick={() => setRegisterOpen(true)}
          >
            Register lot (F2)
          </button>
        </div>
      </section>

      <Show when={submittedFilters()}>
        <div class="mt-6">
          <SpreadsheetGrid<LotBatchRow>
            columns={[
              { key: "lot_no", header: "Lot no.", clickable: true },
              { key: "item_code", header: "Item code" },
              { key: "item_name", header: "Item name" },
              { key: "location_name", header: "Location" },
              {
                key: "qty_on_hand",
                header: "Qty on hand",
                render: (r) => r.qty_on_hand.toLocaleString("en-PH", { maximumFractionDigits: 4 }),
              },
              { key: "expiry_date", header: "Expiry", render: (r) => r.expiry_date?.slice(0, 10) ?? "—" },
              { key: "updated_at", header: "Updated", render: (r) => r.updated_at.slice(0, 10) },
              {
                key: "history",
                header: "History",
                sortable: false,
                render: (r) => (
                  <ActivityHistoryLink module="serial-lot" targetType="inv_lot_batch" targetId={r.id} title={`History — ${r.lot_no}`} />
                ),
              },
            ]}
            rows={list.data?.rows ?? []}
            loading={list.isFetching}
            selectedId={selectedId()}
            onSelect={setSelectedId}
            codeKey="lot_no"
            nameKey="item_name"
            sortKey={sort()}
            sortOrder={order()}
            onSort={toggleSort}
            page={page()}
            pageSize={pageSize}
            total={list.data?.total ?? 0}
            onPageChange={setPage}
            onRefresh={invalidate}
            onNew={() => {}}
            onEdit={() => {}}
          />
        </div>
      </Show>

      <Modal open={registerOpen()} title="Register lot batch" onClose={() => setRegisterOpen(false)}>
        <div class="grid gap-4">
          <LookupCombo
            label="Item (lot-tracked)"
            value={regItemLabel}
            selectedId={regItemId}
            onInput={setRegItemLabel}
            onSelect={(o) => {
              setRegItemId(o.id);
              setRegItemLabel(o.label);
            }}
            onClear={() => {
              setRegItemId(null);
              setRegItemLabel("");
            }}
            fetchOptions={fetchItems}
          />
          <LookupCombo
            label="Location"
            value={regLocationLabel}
            selectedId={regLocationId}
            onInput={setRegLocationLabel}
            onSelect={(o) => {
              setRegLocationId(o.id);
              setRegLocationLabel(o.label);
            }}
            onClear={() => {
              setRegLocationId(null);
              setRegLocationLabel("");
            }}
            fetchOptions={fetchLocations}
          />
          <Field label="Lot number">
            <input class={inputClass} value={regLotNo()} onInput={(e) => setRegLotNo(e.currentTarget.value)} />
          </Field>
          <Field label="Quantity">
            <DecimalInput mode="qty" class={inputClass} value={regQty()} onValue={setRegQty} />
          </Field>
          <Field label="Expiry date">
            <DateInput value={regExpiry()} onInput={(e) => setRegExpiry(e.currentTarget.value)} />
          </Field>
          <div class="flex justify-end gap-2 pt-2">
            <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={() => setRegisterOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              disabled={regSaving()}
              onClick={() => void saveRegister()}
            >
              {regSaving() ? "Saving…" : "Register"}
            </button>
          </div>
        </div>
      </Modal>
    </SerialLotLayout>
  );
}
