import { A, useSearchParams } from "@solidjs/router";
import { createMemo, createSignal, onMount, Show } from "solid-js";
import { DateInput } from "../../../shared/DateInput";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../../shared/SpreadsheetGrid";
import {
  patchWarrantyAsset,
  syncWarrantyFromSales,
  useInvalidateWarrantyAssets,
  useWarrantyAssets,
  type WarrantyAsset,
  type WarrantyAssetStatus,
} from "../../../shared/useWarrantyAssets";
import { useListState } from "../../../shared/useListState";
import { useToast } from "../../../shared/toast";
import { CrmTaskCell } from "../../../shared/CrmTaskCell";
import { useCrmTaskSummaries } from "../../../shared/useCrmTaskSummaries";
import { apiFetch } from "../../../shared/api";
import { AfterSalesLayout } from "./AfterSalesLayout";

function paramStr(raw: string | string[] | undefined): string {
  if (typeof raw === "string") return raw.trim();
  if (Array.isArray(raw)) return String(raw[0] ?? "").trim();
  return "";
}

export default function CustomerWarrantyPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } =
    useListState("warranty_end");
  const [selected, setSelected] = createSignal<WarrantyAsset | null>(null);
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [syncSalesId, setSyncSalesId] = createSignal("");
  const [editEnd, setEditEnd] = createSignal("");
  const [editStatus, setEditStatus] = createSignal<WarrantyAssetStatus>("active");
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const invalidate = useInvalidateWarrantyAssets();

  const openEdit = (row: WarrantyAsset) => {
    setSelected(row);
    setEditEnd(row.warranty_end);
    setEditStatus(row.status);
    setModalOpen(true);
  };

  onMount(() => {
    const fromQ = paramStr(searchParams.q);
    if (fromQ) setQ(fromQ);

    const openId = Number(paramStr(searchParams.open) || paramStr(searchParams.openId));
    if (openId > 0) {
      void (async () => {
        const res = await apiFetch<WarrantyAsset>(`/api/v1/crm/warranty-assets/${openId}`, {}, { silent: true });
        if (res.success && res.data) openEdit(res.data);
        setSearchParams({ open: undefined, openId: undefined }, { replace: true });
      })();
    }
  });

  const list = useWarrantyAssets(() => ({
    page: page(),
    pageSize,
    q: q() || undefined,
    status: statusFilter() || undefined,
    coverage: "sales",
  }));

  const warrantyIds = createMemo(() => (list.data?.rows ?? []).map((r) => r.id));
  const taskSummaries = useCrmTaskSummaries(() => ({ warrantyIds: warrantyIds() }));

  const save = async () => {
    const row = selected();
    if (!row) return;
    setSaving(true);
    const res = await patchWarrantyAsset(row.id, {
      warranty_end: editEnd(),
      status: editStatus(),
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not update warranty asset.");
      return;
    }
    setModalOpen(false);
    invalidate();
  };

  const syncFromSales = async () => {
    const id = Number(syncSalesId());
    if (!id) {
      toast.warning("Enter a sales ID.");
      return;
    }
    const res = await syncWarrantyFromSales(id);
    if (!res.success) {
      toast.warning(res.message ?? "Sync failed.");
      return;
    }
    setSyncSalesId("");
    invalidate();
  };

  return (
    <AfterSalesLayout>
      <div class="mb-3 rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-2 text-xs text-slate-700">
        Sold serials with customer coverage. Unit history →{" "}
        <A href="/app/inventory/serial-lot/trace" class="font-medium text-brand-700 hover:underline">
          Serial Trace
        </A>
        . Lots are stock expiry only — not warranty. For repair jobs, use{" "}
        <A href="/app/after-sales/repair-orders" class="font-medium text-brand-700 hover:underline">
          Repair Orders
        </A>
        .
      </div>

      <details class="mb-4 rounded-xl border border-stroke bg-white">
        <summary class="cursor-pointer select-none px-4 py-3 text-sm font-medium text-text-secondary hover:bg-slate-50">
          Admin: repair sync from sales ID
        </summary>
        <div class="border-t border-stroke px-4 py-3">
          <Field label="Sales ID">
            <div class="flex max-w-md gap-2">
              <input
                type="number"
                class={inputClass}
                placeholder="Sales ID"
                value={syncSalesId()}
                onInput={(e) => setSyncSalesId(e.currentTarget.value)}
              />
              <button
                type="button"
                class="shrink-0 rounded-lg border border-stroke px-3 py-2 text-sm hover:bg-slate-50"
                onClick={() => void syncFromSales()}
              >
                Sync
              </button>
            </div>
          </Field>
          <p class="mt-2 text-xs text-text-secondary">
            Coverage is created automatically when a sale with serials is saved. Use this only to repair a missed sync.
          </p>
        </div>
      </details>

      <SpreadsheetGrid
        columns={[
          { key: "serial_no", header: "Serial", clickable: true },
          { key: "item_code", header: "Item code" },
          { key: "item_name", header: "Item name", clickable: true },
          { key: "partner_name", header: "Customer", render: (r) => r.partner_name ?? "—" },
          { key: "warranty_start", header: "Start" },
          { key: "warranty_end", header: "End" },
          { key: "status", header: "Status" },
          { key: "pic_name", header: "PIC" },
          {
            key: "crm_task",
            header: "Task",
            sortable: false,
            render: (r) => (
              <CrmTaskCell
                summary={taskSummaries.data?.by_warranty[String(r.id)]}
                context={{
                  task_type: "warranty_follow_up",
                  warranty_asset_id: r.id,
                  partner_id: r.partner_id,
                  partner_name: r.partner_name ?? undefined,
                  pic_name: r.pic_name,
                  title: `Warranty follow-up — ${r.serial_no}`,
                  notes: `${r.item_name} · ends ${r.warranty_end}`,
                }}
              />
            ),
          },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={openEdit}
        onNew={() => {}}
        showNew={false}
        codeKey="serial_no"
        nameKey="item_name"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        page={page()}
        pageSize={pageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        search={q()}
        onSearchChange={setQ}
        searchPlaceholder="Search serial, item, customer…"
        status={statusFilter()}
        onStatusChange={setStatusFilter}
        statusOptions={[
          { value: "", label: "All" },
          { value: "active", label: "Active" },
          { value: "expired", label: "Expired" },
          { value: "void", label: "Void" },
        ]}
      />

      <EntityModal
        open={modalOpen()}
        title="Edit customer warranty"
        onClose={() => setModalOpen(false)}
        onSave={() => void save()}
        saving={saving()}
      >
        <Show when={selected()}>
          {(row) => (
            <>
              <Field label="Serial">
                <input class={inputClass} value={row().serial_no} readOnly />
              </Field>
              <Field label="Customer">
                <input class={inputClass} value={row().partner_name ?? "—"} readOnly />
              </Field>
              <Field label="Coverage end">
                <DateInput value={editEnd()} onInput={(e) => setEditEnd(e.currentTarget.value)} />
              </Field>
              <Field label="Status">
                <select
                  class={inputClass}
                  value={editStatus()}
                  onChange={(e) => setEditStatus(e.currentTarget.value as WarrantyAssetStatus)}
                >
                  <option value="active">Active</option>
                  <option value="expired">Expired</option>
                  <option value="void">Void</option>
                </select>
              </Field>
              <p class="text-xs text-text-secondary">
                <A
                  href={`/app/inventory/serial-lot/trace?serial_no=${encodeURIComponent(row().serial_no)}`}
                  class="font-medium text-brand-700 hover:underline"
                >
                  Open Serial Trace
                </A>
              </p>
            </>
          )}
        </Show>
      </EntityModal>
    </AfterSalesLayout>
  );
}
