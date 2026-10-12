import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, Index, onMount, Show } from "solid-js";
import { useNavigate, useSearchParams } from "@solidjs/router";
import { apiFetch } from "../../../shared/api";
import { ActivityHistoryLink } from "../../../shared/ActivityHistoryLink";
import { CustomFieldsSection, collectCustomFieldErrors } from "../../../shared/CustomFieldsSection";
import { listViewParam } from "../../../shared/DocumentListViewBar";
import { LineUnitSelect } from "../../../shared/LineUnitSelect";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";
import { ModalField } from "../../../shared/ModalField";
import { modalDismissClass } from "../../../shared/Modal";
import { resolveInventoryItemByCode } from "../../../shared/resolveInventoryItemByCode";
import { PURCHASE_REQUEST_ENTITY, PURCHASE_REQUEST_SETTINGS_HREF } from "../../../shared/entityTypes";
import { inputClass, SpreadsheetGrid } from "../../../shared/SpreadsheetGrid";
import { useFormFieldSettings } from "../../../shared/useFormFieldSettings";
import { useTransactionListState } from "../../../shared/useListState";
import { useToast } from "../../../shared/toast";
import { takeDocSeed } from "../../../shared/docSeed";

type RfqRow = {
  id: number;
  rfq_no: string;
  rfq_date: string;
  status: string;
  line_count: number;
};

type RfqLineDraft = {
  item_id: number | null;
  item_code: string;
  item_name: string;
  qty: string;
  unit_id: number | null;
  unit_code: string;
};

const RFQ_STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "closed", label: "Closed" },
  { value: "cancelled", label: "Cancelled" },
];

function rfqStatusLabel(status: string): string {
  return RFQ_STATUS_OPTIONS.find((t) => t.value === status)?.label ?? status;
}

const emptyRfqLine = (): RfqLineDraft => ({
  item_id: null,
  item_code: "",
  item_name: "",
  qty: "1",
  unit_id: null,
  unit_code: "",
});

async function fetchItems(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; item_code: string; item_name: string }[]>(
    `/api/v1/inventory/items?${qs}`,
  );
  return (res.data ?? []).map((i) => ({ id: i.id, label: `${i.item_code} — ${i.item_name}` }));
}

export default function RfqListPage() {
  const toast = useToast();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { byKey, fields } = useFormFieldSettings(PURCHASE_REQUEST_ENTITY.rfq);
  const [createOpen, setCreateOpen] = createSignal(false);
  const [lines, setLines] = createSignal<RfqLineDraft[]>([emptyRfqLine()]);
  const [notes, setNotes] = createSignal("");
  const [customValues, setCustomValues] = createSignal<Record<string, unknown>>({});
  const [creating, setCreating] = createSignal(false);
  const [selectedId, setSelectedId] = createSignal<number | null>(null);

  // Baiko approve-to-seed handoff: staged RFQ lines open the create panel prefilled.
  onMount(() => {
    const seed = takeDocSeed("rfq");
    if (seed?.lines?.length) {
      const seeded = seed.lines.slice(0, 200).map((line) => ({
        item_id: line.item_id ?? null,
        item_code: line.item_code?.trim() ?? "",
        item_name: line.item_name?.trim() ?? "",
        qty: line.qty == null ? "1" : String(line.qty),
        unit_id: line.unit_id ?? null,
        unit_code: (line.unit_code ?? line.unit ?? "").trim(),
      }));
      if (seeded.length) {
        setLines(seeded);
        setCreateOpen(true);
        if (seed.needs_qty_review) {
          toast.warning("Baiko prefilled RFQ lines with qty 1 — review quantities before creating.");
        }
      }
    }
    if (searchParams.new === "1" || searchParams.new === "true") {
      setCreateOpen(true);
      setSearchParams({ new: undefined }, { replace: true });
    }
  });

  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize, setPageSize } =
    useTransactionListState("rfq_date", 25);
  const view = () => {
    const v = listViewParam(searchParams.view);
    return v === "outstanding" || v === "history" ? v : "";
  };

  const list = createQuery(() => ({
    queryKey: ["rfq-list", view(), page(), pageSize(), q(), statusFilter(), sort(), order()],
    queryFn: async () => {
      const qs = new URLSearchParams({
        page: String(page()),
        pageSize: String(pageSize()),
        sort: sort(),
        order: order(),
      });
      const v = view();
      if (v) qs.set("view", v);
      else if (statusFilter()) qs.set("status", statusFilter());
      const search = q().trim();
      if (search) qs.set("q", search);
      const res = await apiFetch<RfqRow[]>(`/api/v1/purchase-order/rfq?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load");
      return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
    },
  }));

  const invalidate = () => void client.invalidateQueries({ queryKey: ["rfq-list"] });

  const addLine = () => setLines((prev) => [...prev, emptyRfqLine()]);

  const resetCreate = () => {
    setLines([emptyRfqLine()]);
    setNotes("");
    setCustomValues({});
    setCreateOpen(false);
  };

  const createRfq = async () => {
    const customDefs = fields()
      .filter((f) => f.kind === "custom" && f.is_active && f.is_visible)
      .map((f) => ({ field_key: f.field_key, label: f.label, is_required: f.is_required }));
    const customErrs = collectCustomFieldErrors(customValues(), customDefs);
    if (Object.keys(customErrs).length > 0) {
      toast.warning(Object.values(customErrs)[0] ?? "Check custom fields.");
      return;
    }
    const payload = lines()
      .map((ln) => ({
        item_id: ln.item_id ?? undefined,
        item_code: ln.item_code,
        item_name: ln.item_name,
        qty: Number(ln.qty),
        unit_id: ln.unit_id ?? undefined,
        unit_code: ln.unit_code || undefined,
      }))
      .filter((ln) => ln.qty > 0 && (ln.item_id || ln.item_name));
    if (!payload.length) {
      toast.warning("Add at least one line with item and quantity.");
      return;
    }
    setCreating(true);
    const notesTrim = notes().trim();
    const res = await apiFetch<{ rfq_no: string }>("/api/v1/purchase-order/rfq", {
      method: "POST",
      body: JSON.stringify({
        notes: notesTrim || undefined,
        custom_values: customValues(),
        lines: payload,
      }),
    });
    setCreating(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to create RFQ.");
      return;
    }
    toast.success(`RFQ ${res.data?.rfq_no ?? "created"}. Open it to add suppliers and collect quotes.`);
    resetCreate();
    invalidate();
  };

  return (
    <div class="space-y-4">
      <h1 class="text-xl font-semibold text-slate-900">
        {view() === "outstanding" ? "Outstanding RFQ" : view() === "history" ? "RFQ history" : "Request for Quotation"}
      </h1>
      <p class="text-sm text-text-secondary">
        {view() === "outstanding"
          ? "Sent requests waiting on supplier quotes."
          : view() === "history"
            ? "Closed and cancelled requests."
            : "Draft, sent, closed, and cancelled requests."}
      </p>

      <SpreadsheetGrid
        columns={[
          { key: "rfq_no", header: "RFQ No", clickable: true },
          { key: "rfq_date", header: "Date" },
          {
            key: "status",
            header: "Status",
            sortable: true,
            render: (row) => <span>{rfqStatusLabel(row.status)}</span>,
          },
          { key: "line_count", header: "Lines", sortable: false },
          {
            key: "history",
            header: "History",
            sortable: false,
            render: (row) => (
              <ActivityHistoryLink
                module="purchase_order"
                targetType="rfq_request"
                targetId={row.id}
                title={`History — ${row.rfq_no}`}
              />
            ),
          },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={(row) => navigate(`/app/purchase-order/rfq/${row.id}`)}
        onNew={() => setCreateOpen(true)}
        newLabel="New RFQ"
        settingsHref={PURCHASE_REQUEST_SETTINGS_HREF.rfq}
        codeKey="rfq_no"
        nameKey="rfq_date"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        page={page()}
        pageSize={pageSize()}
        onPageSizeChange={setPageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        search={q()}
        onSearchChange={setQ}
        searchPlaceholder="Search RFQ no. or notes"
        status={view() ? "" : statusFilter()}
        onStatusChange={view() ? undefined : setStatusFilter}
        statusLabel="Status"
        statusOptions={RFQ_STATUS_OPTIONS}
        onRefresh={invalidate}
      />

      <Show when={createOpen()}>
        <div class="fixed inset-0 z-[55] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
          <div class="w-full max-w-2xl rounded-2xl border border-stroke bg-white p-6 shadow-xl">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="text-lg font-semibold">New RFQ</h2>
              <button type="button" class={modalDismissClass} onClick={resetCreate}>
                Close
              </button>
            </div>
            <p class="mb-3 text-xs text-text-secondary">
              Free-text products are allowed on RFQ. Register items in Inventory before converting to a Purchase Order.
            </p>
            <ModalField settings={byKey} fieldKey="notes" fallbackLabel="Notes" span="full">
              {(m) => (
                <textarea
                  rows={2}
                  class={inputClass}
                  value={notes()}
                  disabled={m.disabled}
                  placeholder={m.placeholder || "Optional notes for suppliers"}
                  onInput={(e) => setNotes(e.currentTarget.value)}
                  {...m.inputProps}
                />
              )}
            </ModalField>
            <CustomFieldsSection
              entityType={PURCHASE_REQUEST_ENTITY.rfq}
              values={customValues}
              onChange={(key, value) => setCustomValues((prev) => ({ ...prev, [key]: value }))}
            />
            <Index each={lines()}>
              {(ln, idx) => (
                <div class="mb-3 space-y-2 rounded-lg border border-stroke p-3">
                  <LookupCombo
                    label={`Item ${idx + 1} (search inventory or type a free-text name)`}
                    value={() => {
                      const l = ln();
                      if (l.item_id && l.item_code) return `${l.item_code} — ${l.item_name}`;
                      return l.item_name || l.item_code || "";
                    }}
                    selectedId={() => ln().item_id}
                    onInput={(text) => {
                      setLines((prev) => {
                        const next = [...prev];
                        next[idx] = {
                          ...next[idx],
                          item_id: null,
                          item_code: "",
                          item_name: text,
                        };
                        return next;
                      });
                    }}
                    onSelect={(o) => {
                      const parts = o.label.split(" — ");
                      setLines((prev) => {
                        const next = [...prev];
                        next[idx] = {
                          ...next[idx],
                          item_id: o.id,
                          item_code: parts[0] ?? "",
                          item_name: parts.slice(1).join(" — ") || o.label,
                        };
                        return next;
                      });
                    }}
                    onClear={() => {
                      setLines((prev) => {
                        const next = [...prev];
                        next[idx] = { ...emptyRfqLine(), qty: next[idx].qty };
                        return next;
                      });
                    }}
                    fetchOptions={fetchItems}
                    placeholder="Type product name or search inventory…"
                  />
                  <div class="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_100px_110px]">
                    <label class="block text-sm">
                      <span class="text-text-secondary">Item code (optional)</span>
                      <input
                        class="mt-1 w-full rounded border border-stroke px-2 py-1"
                        value={ln().item_code}
                        placeholder="Registered code → Tab to auto-fill"
                        onInput={(e) => {
                          const v = e.currentTarget.value;
                          setLines((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], item_code: v, item_id: null };
                            return next;
                          });
                        }}
                        onBlur={(e) => {
                          const code = e.currentTarget.value.trim();
                          if (!code) return;
                          void (async () => {
                            const { item, error } = await resolveInventoryItemByCode(code);
                            if (error) {
                              toast.warning(error);
                              return;
                            }
                            if (!item) return;
                            setLines((prev) => {
                              const next = [...prev];
                              next[idx] = {
                                ...next[idx],
                                item_id: item.id,
                                item_code: item.item_code,
                                item_name: item.item_name,
                                unit_id: item.base_unit_id ?? next[idx].unit_id,
                                unit_code: item.base_unit_code ?? next[idx].unit_code,
                              };
                              return next;
                            });
                          })();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            (e.currentTarget as HTMLInputElement).blur();
                          }
                        }}
                      />
                    </label>
                    <label class="block text-sm">
                      <span class="text-text-secondary">Qty</span>
                      <input
                        type="number"
                        class="mt-1 w-full rounded border border-stroke px-2 py-1"
                        min="0"
                        value={ln().qty}
                        onInput={(e) => {
                          const v = e.currentTarget.value;
                          setLines((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], qty: v };
                            return next;
                          });
                        }}
                      />
                    </label>
                    <label class="block text-sm">
                      <span class="text-text-secondary">UoM</span>
                      <div class="mt-1">
                        <LineUnitSelect
                          unitId={ln().unit_id}
                          unitCode={ln().unit_code}
                          onChange={(u) =>
                            setLines((prev) => {
                              const next = [...prev];
                              next[idx] = { ...next[idx], unit_id: u.unit_id, unit_code: u.unit_code };
                              return next;
                            })
                          }
                        />
                      </div>
                    </label>
                  </div>
                </div>
              )}
            </Index>
            <button type="button" class="text-sm text-brand-600 hover:underline" onClick={addLine}>
              + Add line
            </button>
            <div class="mt-6 flex justify-end gap-2">
              <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={resetCreate}>
                Cancel
              </button>
              <button
                type="button"
                class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={creating()}
                onClick={() => void createRfq()}
              >
                {creating() ? "Saving…" : "Create RFQ"}
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
