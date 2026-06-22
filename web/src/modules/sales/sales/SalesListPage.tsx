import { createSignal, onMount } from "solid-js";
import { useLocation, useNavigate } from "@solidjs/router";
import { apiFetch } from "../../../shared/api";
import { SpreadsheetGrid } from "../../../shared/SpreadsheetGrid";
import { SALES_SETTINGS_HREF } from "../../../shared/entityTypes";
import { useListState } from "../../../shared/useListState";
import {
  patchSalesInvoicing,
  patchSalesProgress,
  useInvalidateSales,
  useSalesList,
  type SalesRow,
} from "../../../shared/useSalesList";
import { useToast } from "../../../shared/toast";
import { ActivityHistoryLink } from "../../../shared/ActivityHistoryLink";
import { SalesLayout } from "../SalesLayout";
import { ProgressStatusMenu } from "./ProgressStatusMenu";
import { SalesModal, type SalesDetail } from "./SalesModal";
import { formatMoney, openSalesPrint } from "./salesPrint";
import { progressStatusLabel } from "./progressStatus";
import type { SalesTemplateCode } from "./SalesLineGrid";

type PageOptions = {
  openNewOnMount?: boolean;
  templateCode?: SalesTemplateCode;
};

export function SalesListPageInner(props: PageOptions = {}) {
  const loc = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const invalidate = useInvalidateSales();

  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } = useListState(
    "order_date",
    25,
    { defaultOrder: "desc" },
  );
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<SalesDetail | null>(null);
  const [templateCode, setTemplateCode] = createSignal<SalesTemplateCode>(props.templateCode ?? "default");

  const list = useSalesList(() => ({
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

  const openEdit = async (row: SalesRow) => {
    const res = await apiFetch<SalesDetail>(`/api/v1/sales/${row.id}`);
    if (!res.success || !res.data) return;
    setEditing(res.data);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    if (loc.pathname.endsWith("/new")) {
      navigate("/app/sales/sales", { replace: true });
    }
  };

  const onProgressChange = async (row: SalesRow, status: string) => {
    const res = await patchSalesProgress(row.id, status);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to update progress.");
      return;
    }
    invalidate();
  };

  const onInvoicingToggle = async (row: SalesRow) => {
    const res = await patchSalesInvoicing(row.id, !row.invoicing_status);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to update invoicing status.");
      return;
    }
    invalidate();
  };

  onMount(() => {
    if (props.templateCode) setTemplateCode(props.templateCode);
    if (props.openNewOnMount || loc.pathname.endsWith("/new")) openNew();
  });

  return (
    <SalesLayout>
      <SpreadsheetGrid
        columns={[
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
          { key: "date_no_display", header: "Date-no", clickable: true },
          { key: "due_date", header: "Due Date", render: (r) => r.due_date ?? "" },
          { key: "payment_terms", header: "Payment Terms", render: (r) => r.payment_terms ?? "" },
          { key: "si_dr_no", header: "SI/DR No.", render: (r) => r.si_dr_no ?? "" },
          { key: "tax_type_name", header: "Tax Type" },
          { key: "customer_name", header: "Customer" },
          { key: "item_name_summary", header: "Item Name" },
          {
            key: "grand_total",
            header: "Grand Total",
            render: (r) => formatMoney(r.grand_total, r.currency_code),
          },
          {
            key: "invoicing_status",
            header: "Invoicing",
            sortable: false,
            render: (r) => (
              <button
                type="button"
                class="text-lg leading-none"
                title={r.invoicing_status ? "Invoiced — click to mark not invoiced" : "Not invoiced — click to mark invoiced"}
                onClick={(e) => {
                  e.stopPropagation();
                  void onInvoicingToggle(r);
                }}
              >
                {r.invoicing_status ? "✓" : "✗"}
              </button>
            ),
          },
          { key: "location_name", header: "Location", render: (r) => r.location_name ?? "" },
          { key: "created_by_name", header: "Creator", render: (r) => r.created_by_name ?? "" },
          { key: "pic_name", header: "PIC" },
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
                  openSalesPrint(r.id);
                }}
              >
                Print
              </button>
            ),
          },
          {
            key: "history",
            header: "History",
            sortable: false,
            render: (r) => (
              <ActivityHistoryLink module="sales" targetType="sa_sales" targetId={r.id} />
            ),
          },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={(row) => void openEdit(row)}
        onNew={openNew}
        codeKey="sales_no"
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
        searchPlaceholder="Search sales no., customer, SI/DR, item…"
        status={statusFilter()}
        onStatusChange={setStatusFilter}
        statusLabel="Progress"
        statusOptions={[
          { value: "unconfirmed", label: progressStatusLabel("unconfirmed") },
          { value: "completed", label: progressStatusLabel("completed") },
          { value: "", label: "All" },
        ]}
        onRefresh={invalidate}
        settingsHref={SALES_SETTINGS_HREF.sales}
      />

      <SalesModal
        open={modalOpen()}
        editing={editing()}
        templateCode={templateCode()}
        onClose={closeModal}
        onSaved={invalidate}
      />
    </SalesLayout>
  );
}

export default function SalesListPage() {
  return <SalesListPageInner />;
}
