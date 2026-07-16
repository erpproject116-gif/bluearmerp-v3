import { createSignal, onMount, Show } from "solid-js";
import { A, useLocation, useNavigate } from "@solidjs/router";
import { apiFetch } from "../../../shared/api";
import { SpreadsheetGrid } from "../../../shared/SpreadsheetGrid";
import { INVENTORY_SETTINGS_HREF } from "../../../shared/entityTypes";
import { useListState } from "../../../shared/useListState";
import { useInvalidateRepairOrders, useRepairOrderList, type RepairOrderRow } from "../../../shared/useRepairOrderList";
import { AfterSalesLayout } from "./AfterSalesLayout";
import { RepairOrderModal, type RepairOrderDetail } from "./RepairOrderModal";
import { openRepairOrderPrint } from "./repairOrderPrint";

type PageOptions = {
  defaultProgressFilter?: string;
  openNewOnMount?: boolean;
};

export function RepairOrderListPageInner(props: PageOptions = {}) {
  const loc = useLocation();
  const navigate = useNavigate();
  const invalidate = useInvalidateRepairOrders();

  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } = useListState(
    "order_date",
    25,
    { defaultOrder: "desc", defaultStatus: props.defaultProgressFilter ?? "" },
  );
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<RepairOrderDetail | null>(null);

  const list = useRepairOrderList(() => ({
    page: page(),
    pageSize,
    sort: sort(),
    order: order(),
    q: q() || undefined,
    progressStatus: statusFilter() || undefined,
  }));

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = async (row: RepairOrderRow) => {
    const res = await apiFetch<RepairOrderDetail>(`/api/v1/inventory/repair-orders/${row.id}`);
    if (!res.success || !res.data) return;
    setEditing(res.data);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    if (loc.pathname.endsWith("/new")) {
      navigate("/app/after-sales/repair-orders", { replace: true });
    }
  };

  onMount(() => {
    if (props.openNewOnMount || loc.pathname.endsWith("/new")) {
      openNew();
    }
  });

  return (
    <AfterSalesLayout>
      <div class="mb-3 rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-2 text-xs text-slate-700">
        Repair jobs and service work. For sold-unit warranty end dates and CRM follow-ups, see{" "}
        <A href="/app/crm/warranty-assets" class="font-medium text-brand-700 hover:underline">
          Warranty coverage
        </A>{" "}
        (CRM).
      </div>
      <SpreadsheetGrid
        columns={[
          { key: "date_no_display", header: "Date-no", clickable: true },
          { key: "repair_order_no", header: "Repair Order No.", clickable: true },
          { key: "latest_update", header: "Latest Update", render: (r) => (r.latest_update ? String(r.latest_update).slice(0, 80) : "") },
          { key: "customer_name", header: "Customer/Vendor" },
          { key: "pic_name", header: "PIC Name" },
          {
            key: "scheduled_completion_date",
            header: "Repair date",
            render: (r) => formatRepairDate(r.scheduled_completion_date),
          },
          {
            key: "receipt",
            header: "Receipt",
            sortable: false,
            render: (r) => (
              <button
                type="button"
                class="text-brand-600 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  openRepairOrderPrint(r.id, "receipt");
                }}
              >
                Print
              </button>
            ),
          },
          {
            key: "details",
            header: "Details",
            sortable: false,
            render: (r) => (
              <button
                type="button"
                class="text-brand-600 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  openRepairOrderPrint(r.id, "warranty");
                }}
              >
                Warranty
              </button>
            ),
          },
          {
            key: "progress_status",
            header: "Progress",
            render: (r) => (r.progress_status === "finished" ? "Finished" : "Received"),
          },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={(row) => void openEdit(row)}
        onNew={openNew}
        codeKey="repair_order_no"
        nameKey="date_no_display"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        page={page()}
        pageSize={pageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        search={q()}
        onSearchChange={setQ}
        searchPlaceholder="Search order no, customer, PIC, update…"
        status={statusFilter()}
        onStatusChange={setStatusFilter}
        statusLabel="Progress"
        statusOptions={[
          { value: "received", label: "Received" },
          { value: "finished", label: "Finished" },
          { value: "", label: "All" },
        ]}
        onRefresh={invalidate}
        settingsHref={INVENTORY_SETTINGS_HREF.repairOrder}
      />

      <Show when={statusFilter() === ""}>
        <p class="mt-2 text-xs text-text-secondary">
          Status filter: leave as All or choose Received / Finished. Repair Order Status view presets this filter.
        </p>
      </Show>

      <RepairOrderModal
        open={modalOpen()}
        editing={editing()}
        onClose={closeModal}
        onSaved={invalidate}
      />
    </AfterSalesLayout>
  );
}

function formatRepairDate(iso?: string | null) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${m}/${d}/${y}`;
}

export default function RepairOrderListPage() {
  return <RepairOrderListPageInner />;
}
