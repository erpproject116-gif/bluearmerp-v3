import { createSignal, onMount, Show } from "solid-js";
import { formatPeso } from "../../../shared/money";
import { useLocation, useNavigate } from "@solidjs/router";
import { SpreadsheetGrid } from "../../../shared/SpreadsheetGrid";
import { PURCHASES_SETTINGS_HREF } from "../../../shared/entityTypes";
import { useListState } from "../../../shared/useListState";
import {
  useInvalidateSupplierInvoices,
  useSupplierInvoiceList,
  type SupplierInvoiceDetail,
  type SupplierInvoiceRow,
} from "../../../shared/useSupplierInvoiceList";
import { PurchasesLayout } from "../../purchases/PurchasesLayout";
import { SupplierInvoiceModal } from "./SupplierInvoiceModal";
import { WideEntityModal } from "../../../shared/WideEntityModal";
import { InvoicePanel } from "../../../shared/InvoicePanel";
import { RecordHistoryButton } from "../../../shared/RecordHistoryButton";
import { ActivityHistoryLink } from "../../../shared/ActivityHistoryLink";
import { DOC_PROGRESS_STATUS_TABS, docProgressStatusLabel } from "../../../shared/docProgressStatusTabs";
import { apiFetch } from "../../../shared/api";
import { useToast } from "../../../shared/toast";
import { hasPermission, useAuth } from "../../../shared/auth-context";

type PageOptions = { openNewOnMount?: boolean };

function listBasePath(pathname: string) {
  return pathname.startsWith("/app/purchases") ? "/app/purchases/purchases" : "/app/finance/supplier-invoices";
}

export function SupplierInvoiceListPageInner(props: PageOptions = {}) {
  const auth = useAuth();
  const toast = useToast();
  const canQc = () => hasPermission(auth.me, "quality.qc_requests", "write");
  const loc = useLocation();
  const navigate = useNavigate();
  const invalidate = useInvalidateSupplierInvoices();
  const basePath = () => listBasePath(loc.pathname);
  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } = useListState("invoice_date", 25, {
    defaultOrder: "desc",
    defaultStatus: "",
  });
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<SupplierInvoiceDetail | null>(null);
  const [viewRow, setViewRow] = createSignal<SupplierInvoiceRow | null>(null);
  const [qcCreatingId, setQcCreatingId] = createSignal<number | null>(null);

  const createQcRequest = async (row: SupplierInvoiceRow) => {
    setQcCreatingId(row.id);
    const res = await apiFetch("/api/v1/quality/qc-requests", {
      method: "POST",
      body: JSON.stringify({ source_type: "supplier_invoice", supplier_invoice_id: row.id }),
    });
    setQcCreatingId(null);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to create QC request.");
      return;
    }
    toast.success("QC request created.");
  };

  const list = useSupplierInvoiceList(() => ({
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

  const openEdit = async (row: SupplierInvoiceRow) => {
    const res = await apiFetch<SupplierInvoiceDetail>(`/api/v1/finance/supplier-invoices/${row.id}`);
    if (!res.success || !res.data) return;
    setEditing(res.data);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    if (loc.pathname.endsWith("/new")) navigate(basePath(), { replace: true });
  };

  onMount(() => {
    if (props.openNewOnMount || loc.pathname.endsWith("/new")) openNew();
  });

  return (
    <PurchasesLayout>
      <SpreadsheetGrid<SupplierInvoiceRow>
        columns={[
          { key: "date_no_display", header: "Date-no", clickable: true },
          { key: "invoice_no", header: "Purchase No.", clickable: true },
          { key: "vendor_name", header: "Vendor" },
          { key: "vendor_invoice_no", header: "SI/DR No.", render: (r) => r.vendor_invoice_no ?? "" },
          {
            key: "progress_status",
            header: "Progress",
            sortable: false,
            render: (r) => <span>{docProgressStatusLabel(r.progress_status)}</span>,
          },
          { key: "grand_total", header: "Amount", render: (r) => formatPeso(r.grand_total) },
          {
            key: "qc",
            header: "QC",
            sortable: false,
            render: (r) => (
              <Show when={canQc()}>
                <button
                  type="button"
                  class="text-xs text-brand-600 hover:underline disabled:opacity-50"
                  disabled={qcCreatingId() === r.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    void createQcRequest(r);
                  }}
                >
                  {qcCreatingId() === r.id ? "Creating…" : "Create QC Request"}
                </button>
              </Show>
            ),
          },
          {
            key: "history",
            header: "History",
            sortable: false,
            render: (r) => (
              <ActivityHistoryLink
                module={loc.pathname.startsWith("/app/purchases") ? "purchases" : "finance"}
                targetType="fin_supplier_invoice"
                targetId={r.id}
                title={`History — ${r.invoice_no}`}
              />
            ),
          },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={(row) => void openEdit(row)}
        onNew={openNew}
        codeKey="invoice_no"
        nameKey="date_no_display"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        total={list.data?.total ?? 0}
        page={page()}
        pageSize={pageSize}
        onPageChange={setPage}
        search={q()}
        onSearchChange={setQ}
        status={statusFilter()}
        onStatusChange={(status) => {
          setStatusFilter(status);
          setPage(1);
        }}
        statusLabel="Progress"
        statusOptions={[...DOC_PROGRESS_STATUS_TABS]}
        onRefresh={invalidate}
        settingsHref={PURCHASES_SETTINGS_HREF.purchases}
      />
      <SupplierInvoiceModal
        open={modalOpen()}
        editing={editing()}
        onClose={closeModal}
        onSaved={() => {
          invalidate();
          closeModal();
        }}
      />
      <WideEntityModal
        open={viewRow() != null}
        title={viewRow() ? `Purchase ${viewRow()!.invoice_no} — Invoice` : "Invoice"}
        onClose={() => setViewRow(null)}
        readOnly
        headerActions={
          <RecordHistoryButton
            variant="button"
            targetType="fin_supplier_invoice"
            targetId={viewRow()?.id}
            title={viewRow() ? `History — Purchase ${viewRow()!.invoice_no}` : "History"}
          />
        }
      >
        <Show when={viewRow()}>
          <InvoicePanel
            kind="purchase"
            docId={viewRow()!.id}
            attachmentsScope="finance/supplier-invoices"
            onPrint={() =>
              window.open(`${basePath()}/${viewRow()!.id}/print`, "_blank", "noopener,noreferrer")
            }
            onSaved={invalidate}
          />
        </Show>
      </WideEntityModal>
    </PurchasesLayout>
  );
}

export default function SupplierInvoiceListPage() {
  return <SupplierInvoiceListPageInner />;
}
