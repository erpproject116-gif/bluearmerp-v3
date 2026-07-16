import { createSignal, For, onMount, Show } from "solid-js";
import { A, useLocation, useNavigate, useSearchParams } from "@solidjs/router";
import { formatPeso } from "../../../shared/money";
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
import { openPurchaseInvoicePrint } from "../../../shared/invoiceDocumentPrint";
import { RecordHistoryButton } from "../../../shared/RecordHistoryButton";
import { ActivityHistoryLink } from "../../../shared/ActivityHistoryLink";
import { DOC_PROGRESS_STATUS_TABS, docProgressStatusLabel } from "../../../shared/docProgressStatusTabs";
import { apiFetch } from "../../../shared/api";
import { useToast } from "../../../shared/toast";
import { hasPermission, useAuth } from "../../../shared/auth-context";

type PageOptions = { openNewOnMount?: boolean };

const PAYMENT_STATUS_OPTIONS = [
  { value: "", label: "All payments" },
  { value: "unpaid", label: "Unpaid" },
  { value: "partial", label: "Partial" },
  { value: "paid", label: "Paid" },
];

function paymentStatusLabel(status?: string) {
  if (status === "paid") return "Paid";
  if (status === "partial") return "Partial";
  return "Unpaid";
}

function listBasePath(pathname: string) {
  return pathname.startsWith("/app/purchases") ? "/app/purchases/purchases" : "/app/finance/supplier-invoices";
}

export function SupplierInvoiceListPageInner(props: PageOptions = {}) {
  const auth = useAuth();
  const toast = useToast();
  const canQc = () => hasPermission(auth.me, "quality.qc_requests", "write");
  const loc = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const invalidate = useInvalidateSupplierInvoices();
  const basePath = () => listBasePath(loc.pathname);
  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } = useListState("invoice_date", 25, {
    defaultOrder: "desc",
    defaultStatus: "",
  });
  const [paymentStatus, setPaymentStatus] = createSignal(typeof searchParams.payment === "string" ? searchParams.payment : "");
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
    paymentStatus: paymentStatus() || undefined,
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

  const setPaymentFilter = (value: string) => {
    setPaymentStatus(value);
    setPage(1);
    setSearchParams({ payment: value || undefined }, { replace: true });
  };

  onMount(() => {
    if (props.openNewOnMount || loc.pathname.endsWith("/new")) openNew();
    const openId = Number(searchParams.openId ?? "");
    if (openId > 0) {
      void (async () => {
        const res = await apiFetch<SupplierInvoiceDetail>(`/api/v1/finance/supplier-invoices/${openId}`);
        if (res.success && res.data) {
          setEditing(res.data);
          setModalOpen(true);
        }
        setSearchParams({ openId: undefined }, { replace: true });
      })();
    }
  });

  return (
    <PurchasesLayout>
      <div class="mb-4 rounded-xl border border-stroke bg-slate-50 px-4 py-3 text-sm text-text-secondary">
        <p>
          AP path: receive on GR → <span class="font-medium text-text-primary">Generate slip → Purchase</span> → confirm → pay via Cash Payment or Payment Voucher.
          Use <A href="/app/purchases/purchases/pre-invoicing" class="text-brand-600 hover:underline">Pre-invoicing</A> for received lines not yet invoiced, and{" "}
          <button type="button" class="text-brand-600 hover:underline" onClick={() => setPaymentFilter("unpaid")}>
            Unpaid
          </button>{" "}
          to focus open balances.
        </p>
      </div>
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
            key: "balance",
            header: "Balance",
            sortable: false,
            render: (r) => formatPeso(r.balance ?? r.grand_total),
          },
          {
            key: "payment_status",
            header: "Payment",
            sortable: false,
            render: (r) => paymentStatusLabel(r.payment_status),
          },
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
        toolbarExtra={
          <label class="shrink-0">
            <span class="mb-1 block text-xs font-medium text-text-primary">Payment</span>
            <select
              class="h-10 rounded-lg border border-stroke bg-white px-3 text-sm text-text-primary"
              value={paymentStatus()}
              onChange={(e) => setPaymentFilter(e.currentTarget.value)}
            >
              <For each={PAYMENT_STATUS_OPTIONS}>{(opt) => <option value={opt.value}>{opt.label}</option>}</For>
            </select>
          </label>
        }
        onRefresh={invalidate}
        settingsHref={PURCHASES_SETTINGS_HREF.purchases}
      />
      <SupplierInvoiceModal
        open={modalOpen()}
        editing={editing()}
        onClose={closeModal}
        onSaved={() => {
          invalidate();
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
            formOpen={viewRow() != null}
            progressStatus={viewRow()!.progress_status}
            attachmentsScope="finance/supplier-invoices"
            onPrint={() => openPurchaseInvoicePrint(viewRow()!.id)}
            onSaved={invalidate}
            onApprovalChanged={() => {
              void apiFetch<SupplierInvoiceDetail>(`/api/v1/finance/supplier-invoices/${viewRow()!.id}`).then((res) => {
                if (res.success && res.data) {
                  setViewRow((prev) => (prev ? { ...prev, progress_status: res.data!.progress_status } : prev));
                }
              });
            }}
          />
        </Show>
      </WideEntityModal>
    </PurchasesLayout>
  );
}

export default function SupplierInvoiceListPage() {
  return <SupplierInvoiceListPageInner />;
}
