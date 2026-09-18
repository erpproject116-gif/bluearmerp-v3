import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import { A, useLocation, useNavigate, useSearchParams } from "@solidjs/router";
import { formatPeso } from "../../../shared/money";
import { SpreadsheetGrid, type Column } from "../../../shared/SpreadsheetGrid";
import { PURCHASES_ENTITY, PURCHASES_SETTINGS_HREF } from "../../../shared/entityTypes";
import { useListState } from "../../../shared/useListState";
import {
  patchSupplierInvoiceProgress,
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
import { DOC_PROGRESS_STATUS_TABS } from "../../../shared/docProgressStatusTabs";
import { ProgressStatusMenu } from "../../sales/sales/ProgressStatusMenu";
import { apiFetch } from "../../../shared/api";
import { useToast } from "../../../shared/toast";
import { hasPermission, useAuth } from "../../../shared/auth-context";
import { useDocumentLifecycle } from "../../../shared/documentLifecycle";
import {
  applyColumnLabels,
  listViewKey,
  useColumnLabelSettings,
} from "../../../shared/useColumnLabelSettings";

type PageOptions = { openNewOnMount?: boolean };

const PAYMENT_STATUS_OPTIONS = [
  { value: "", label: "All payments" },
  { value: "unpaid", label: "Unpaid" },
  { value: "partial", label: "Partial" },
  { value: "paid", label: "Paid" },
];

function listBasePath(pathname: string) {
  return pathname.startsWith("/app/purchases") ? "/app/purchases/purchase-receive" : "/app/finance/supplier-invoices";
}

export function SupplierInvoiceListPageInner(props: PageOptions = {}) {
  const toast = useToast();
  const auth = useAuth();
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
  const [viewingDeleted, setViewingDeleted] = createSignal(false);
  const [viewRow, setViewRow] = createSignal<SupplierInvoiceRow | null>(null);

  const lifecycle = useDocumentLifecycle({
    apiBase: "/api/v1/finance/supplier-invoices",
    documentLabel: "purchase invoice",
    canManage: () =>
      hasPermission(auth.me, "finance.supplier_invoices", "write") ||
      hasPermission(auth.me, "purchases.purchases", "write"),
    onChanged: invalidate,
  });

  const list = useSupplierInvoiceList(() => ({
    page: page(),
    pageSize,
    sort: sort(),
    order: order(),
    q: q() || undefined,
    progressStatus: statusFilter() || undefined,
    paymentStatus: paymentStatus() || undefined,
    lifecycle: lifecycle.filter(),
  }));

  const listCols = useColumnLabelSettings(listViewKey(PURCHASES_ENTITY.purchases));

  const onProgressChange = async (row: SupplierInvoiceRow, status: string) => {
    const res = await patchSupplierInvoiceProgress(row.id, status);
    if (!res.success) {
      toast.error(res.message ?? "Could not update progress status.");
      return;
    }
    invalidate();
  };

  const gridColumns = createMemo((): Column<SupplierInvoiceRow>[] => {
    const base: Column<SupplierInvoiceRow>[] = [
      { key: "date_no_display", header: "Date-No.", clickable: true, hideable: false },
      {
        key: "vendor_invoice_no",
        header: "SI/DR No. (Tracking No.)",
        sortable: false,
        render: (r) => r.vendor_invoice_no ?? "",
      },
      {
        key: "po_numbers",
        header: "PO Number",
        sortable: false,
        render: (r) => r.po_numbers ?? "",
      },
      {
        key: "notes",
        header: "Notes",
        sortable: false,
        render: (r) => r.notes ?? "",
      },
      {
        key: "payment_terms",
        header: "Payment Terms",
        sortable: false,
        render: (r) => r.payment_terms ?? "",
      },
      {
        key: "tax_type_name",
        header: "Transaction Type Name",
        sortable: false,
        render: (r) => r.tax_type_name ?? "",
      },
      { key: "vendor_name", header: "Customer/Vendor Name" },
      {
        key: "item_name_summary",
        header: "Item Name (Summary)",
        sortable: false,
        render: (r) => r.item_name_summary ?? "",
      },
      {
        key: "grand_total",
        header: "Total Amount",
        render: (r) => formatPeso(r.grand_total),
      },
      {
        key: "progress_status",
        header: "Progress Status",
        sortable: false,
        render: (r) => (
          <ProgressStatusMenu
            class="rounded border border-stroke bg-white px-2 py-1 text-sm text-brand-600"
            value={r.progress_status}
            disabled={r.progress_status === "e_approval"}
            excludeValues={["e_approval"]}
            onChange={(status) => void onProgressChange(r, status)}
          />
        ),
      },
      {
        key: "invoicing_status",
        header: "Invoicing Status",
        sortable: false,
        render: (r) => (
          <span
            class={r.invoicing_status ? "text-lg leading-none text-emerald-600" : "text-lg leading-none text-slate-300"}
            title={r.invoicing_status ? "Purchase invoice JE linked" : "No purchase invoice JE yet"}
          >
            {r.invoicing_status ? "✓" : "—"}
          </span>
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
              openPurchaseInvoicePrint(r.id);
            }}
          >
            Print
          </button>
        ),
      },
      {
        key: "created_by_name",
        header: "Creator",
        sortable: false,
        render: (r) => r.created_by_name ?? "",
      },
      {
        key: "pic_name",
        header: "PIC Name",
        sortable: false,
        render: (r) => r.pic_name ?? "",
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
      {
        key: "lifecycle",
        header: "Manage",
        sortable: false,
        hideable: false,
        render: (r) => <lifecycle.RowAction id={r.id} label={r.invoice_no || r.date_no_display} />,
      },
    ];
    const labeled = applyColumnLabels(base, listCols.columnLabel);
    return labeled.filter((c) => listCols.isColumnVisible(c.key, true));
  });

  const openNew = () => {
    setEditing(null);
    setViewingDeleted(false);
    setModalOpen(true);
  };

  const openEdit = async (row: SupplierInvoiceRow) => {
    const [res, deleted] = await Promise.all([
      apiFetch<SupplierInvoiceDetail>(lifecycle.detailUrl(row.id)),
      lifecycle.resolveDeleted(row.id),
    ]);
    if (!res.success || !res.data) return;
    setEditing(res.data);
    setViewingDeleted(deleted);
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
        } else {
          toast.warning(res.message ?? "Could not open that purchase.");
        }
        setSearchParams({ openId: undefined }, { replace: true });
      })();
    }
  });

  return (
    <PurchasesLayout>
      <Show when={searchParams.from === "goods-receipt"}>
        <div class="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">
          <p class="font-semibold">Looking for Goods Receipt?</p>
          <p class="mt-1 text-xs leading-relaxed">
            That list now lives here as <strong>Purchases</strong>. Use <strong>Purchase Receive</strong>{" "}
            (or Load Slip from a Purchase Order) to post stock and the supplier bill together. You were redirected from
            the old Goods Receipt menu so you would not hit a blank page.
          </p>
        </div>
      </Show>
      <div class="mb-4 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3 text-sm text-slate-700">
        <p class="font-medium text-slate-800">Purchases — receive goods and bill the supplier</p>
        <p class="mt-1 text-xs">
          Load Slip from a Purchase Order (or add lines), set quantities, scan serials if needed, attach the delivery
          note or vendor invoice, then save — Find Stock updates for inventory-tracked lines. Set Progress to{" "}
          <span class="font-medium">Completed</span> on this list when ready to post the payable.
        </p>
        <p class="mt-2 text-xs text-text-secondary">
          Next:{" "}
          <A href="/app/finance/payables" class="font-medium text-brand-700 hover:underline">
            New Payable Payment
          </A>{" "}
          (open balances → pay) or{" "}
          <A href="/app/finance/disbursements" class="text-brand-600 hover:underline">
            Payables hub
          </A>
          . Optional history:{" "}
          <A href="/app/purchases/purchase-receive?view=history" class="font-medium text-brand-700 hover:underline">
            Receive history
          </A>{" "}
          before billing when items track qty or use serials/lots. Pre-invoicing lists received lines not yet billed —
          filter{" "}
          <button type="button" class="text-brand-600 hover:underline" onClick={() => setPaymentFilter("unpaid")}>
            Unpaid
          </button>
          .
        </p>
      </div>
      <SpreadsheetGrid<SupplierInvoiceRow>
        columns={gridColumns()}
        columnPrefsKey={listViewKey(PURCHASES_ENTITY.purchases)}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        selectable
        selectedIds={lifecycle.selectedIds()}
        onSelectionChange={lifecycle.onSelectionChange}
        onEdit={(row) => void openEdit(row)}
        onNew={openNew}
        newLabel="Purchase Receive"
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
          <div class="flex flex-wrap items-end gap-2">
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
            <lifecycle.BulkToolbar />
            <lifecycle.FilterControl />
          </div>
        }
        onRefresh={invalidate}
        settingsHref={PURCHASES_SETTINGS_HREF.purchases}
      />
      <SupplierInvoiceModal
        open={modalOpen()}
        editing={editing()}
        readOnly={viewingDeleted()}
        onClose={closeModal}
        onSaved={() => {
          invalidate();
        }}
      />
      <lifecycle.Dialog />
      <lifecycle.BulkDialog />
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
            onVoided={() => {
              invalidate();
              setViewRow(null);
            }}
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
