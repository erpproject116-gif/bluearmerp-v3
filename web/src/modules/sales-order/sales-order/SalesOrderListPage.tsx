import { createMemo, createSignal, onMount } from "solid-js";
import { useLocation, useNavigate } from "@solidjs/router";
import { apiFetch } from "../../../shared/api";
import { GenerateOtherSlipsMenu } from "../../../shared/GenerateOtherSlipsMenu";
import { SpreadsheetGrid } from "../../../shared/SpreadsheetGrid";
import { SALES_ORDER_SETTINGS_HREF } from "../../../shared/entityTypes";
import { useListState } from "../../../shared/useListState";
import {
  patchSalesOrderProgress,
  useInvalidateSalesOrders,
  useSalesOrderList,
  type SalesOrderRow,
} from "../../../shared/useSalesOrderList";
import { useToast } from "../../../shared/toast";
import { ActivityHistoryLink } from "../../../shared/ActivityHistoryLink";
import { CreateCrmTaskLink } from "../../../shared/CreateCrmTaskLink";
import { SalesOrderLayout } from "../SalesOrderLayout";
import { CreatedSlipModal } from "./CreatedSlipModal";
import { ProgressStatusMenu } from "./ProgressStatusMenu";
import { SalesOrderModal, type SalesOrderDetail } from "./SalesOrderModal";
import { formatMoney, openSalesOrderPrint } from "./salesOrderPrint";
import { progressStatusLabel } from "./progressStatus";

type PageOptions = {
  openNewOnMount?: boolean;
};

export function SalesOrderListPageInner(props: PageOptions = {}) {
  const loc = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const invalidate = useInvalidateSalesOrders();

  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } = useListState(
    "order_date",
    25,
    { defaultOrder: "desc" },
  );
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<SalesOrderDetail | null>(null);
  const [slipOpen, setSlipOpen] = createSignal(false);
  const [slipSalesOrderId, setSlipSalesOrderId] = createSignal<number | null>(null);

  const list = useSalesOrderList(() => ({
    page: page(),
    pageSize,
    sort: sort(),
    order: order(),
    q: q() || undefined,
    progressStatus: statusFilter() || undefined,
  }));

  const selectedIds = createMemo(() => {
    const id = selectedId();
    return id != null ? [id] : [];
  });

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = async (row: SalesOrderRow) => {
    const res = await apiFetch<SalesOrderDetail>(`/api/v1/sales-order/sales-orders/${row.id}`);
    if (!res.success || !res.data) return;
    setEditing(res.data);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    if (loc.pathname.endsWith("/new")) {
      navigate("/app/sales-order/sales-orders", { replace: true });
    }
  };

  const onProgressChange = async (row: SalesOrderRow, status: string) => {
    const res = await patchSalesOrderProgress(row.id, status);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to update progress.");
      return;
    }
    invalidate();
  };

  onMount(() => {
    if (props.openNewOnMount || loc.pathname.endsWith("/new")) openNew();
  });

  return (
    <SalesOrderLayout>
      <SpreadsheetGrid
        columns={[
          { key: "date_no_display", header: "Date-no", clickable: true },
          { key: "sales_order_no", header: "Sales Order No.", clickable: true },
          { key: "customer_name", header: "Customer" },
          { key: "item_name_summary", header: "Item Name" },
          { key: "delivery_date_display", header: "Delivery Date" },
          {
            key: "pct_delivered",
            header: "% Delivered",
            sortable: false,
            render: (r) => <span>{r.pct_delivered ?? 0}%</span>,
          },
          {
            key: "pct_billed",
            header: "% Billed",
            sortable: false,
            render: (r) => <span>{r.pct_billed ?? 0}%</span>,
          },
          {
            key: "grand_total",
            header: "Grand Total",
            render: (r) => formatMoney(r.grand_total, r.currency_code),
          },
          {
            key: "progress_status",
            header: "Progress",
            sortable: false,
            render: (r) => (
              <ProgressStatusMenu
                class="rounded border border-stroke bg-white px-2 py-1 text-sm text-brand-600"
                value={r.progress_status}
                onChange={(status) => void onProgressChange(r, status)}
              />
            ),
          },
          {
            key: "created_slip",
            header: "Created Slip",
            sortable: false,
            render: (r) => (
              <button
                type="button"
                class="text-brand-600 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  setSlipSalesOrderId(r.id);
                  setSlipOpen(true);
                }}
              >
                View
              </button>
            ),
          },
          {
            key: "print",
            header: "Print",
            sortable: false,
            render: (r) => (
              <button
                type="button"
                class="text-brand-600 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  openSalesOrderPrint(r.id);
                }}
              >
                Print
              </button>
            ),
          },
          {
            key: "crm_task",
            header: "CRM",
            sortable: false,
            render: (r) => (
              <CreateCrmTaskLink
                label="Task"
                context={{
                  partner_id: r.partner_id,
                  partner_name: r.customer_name,
                  pic_name: r.pic_name,
                  title: `Follow up — ${r.sales_order_no}`,
                  notes: `Sales order ${r.sales_order_no} (${r.date_no_display})`,
                }}
              />
            ),
          },
          {
            key: "history",
            header: "History",
            sortable: false,
            render: (r) => (
              <ActivityHistoryLink module="sales_order" targetType="so_sales_order" targetId={r.id} />
            ),
          },
          { key: "pic_name", header: "PIC" },
          { key: "created_by_name", header: "Creator", render: (r) => r.created_by_name ?? "" },
          { key: "delivery_remarks", header: "Delivery Remarks", render: (r) => r.delivery_remarks ?? "" },
          { key: "payment_terms", header: "Payment Terms", render: (r) => r.payment_terms ?? "" },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={(row) => void openEdit(row)}
        onNew={openNew}
        codeKey="sales_order_no"
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
        searchPlaceholder="Search sales order, customer, item…"
        status={statusFilter()}
        onStatusChange={setStatusFilter}
        statusLabel="Progress"
        statusOptions={[
          { value: "unconfirmed", label: progressStatusLabel("unconfirmed") },
          { value: "in_progress", label: progressStatusLabel("in_progress") },
          { value: "completed", label: progressStatusLabel("completed") },
          { value: "", label: "All" },
        ]}
        onRefresh={invalidate}
        settingsHref={SALES_ORDER_SETTINGS_HREF.salesOrder}
        toolbarExtra={
          <GenerateOtherSlipsMenu
            sourceEntity="sales_order"
            targets={[
              { label: "Sales (actual sale)", targetEntity: "sales" },
              { label: "Delivery Slip", targetEntity: "delivery_receipt" },
              { label: "Purchase Request (buy to fulfill)", targetEntity: "purchase_request" },
            ]}
            selectedIds={selectedIds}
            onSuccess={() => invalidate()}
          />
        }
      />

      <SalesOrderModal open={modalOpen()} editing={editing()} onClose={closeModal} onSaved={invalidate} />
      <CreatedSlipModal open={slipOpen()} salesOrderId={slipSalesOrderId()} onClose={() => setSlipOpen(false)} />
    </SalesOrderLayout>
  );
}

export default function SalesOrderListPage() {
  return <SalesOrderListPageInner />;
}
