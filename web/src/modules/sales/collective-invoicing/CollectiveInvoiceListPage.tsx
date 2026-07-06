import { createSignal } from "solid-js";
import { SpreadsheetGrid } from "../../../shared/SpreadsheetGrid";
import { SALES_SETTINGS_HREF } from "../../../shared/entityTypes";
import { useListState } from "../../../shared/useListState";
import { useToast } from "../../../shared/toast";
import { SalesLayout } from "../SalesLayout";
import {
  autoBatchCollectiveInvoices,
  useCollectiveInvoices,
  useInvalidateCollectiveInvoices,
  type CollectiveInvoiceRow,
} from "../../../shared/useCollectiveInvoices";
import { CollectiveInvoiceTransactionsModal } from "./CollectiveInvoiceTransactionsModal";
import { ActivityHistoryLink } from "../../../shared/ActivityHistoryLink";

function money(n: number) {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function openSlipPrint(id: number) {
  window.open(`/app/sales/collective-invoicing/${id}/slip/print`, "_blank", "noopener,noreferrer");
}

function openInvoicePrint(id: number, mode: "voucher" | "ar_statement" = "voucher") {
  window.open(
    `/app/sales/collective-invoicing/${id}/invoice/print?mode=${mode}`,
    "_blank",
    "noopener,noreferrer",
  );
}

export default function CollectiveInvoiceListPage() {
  const toast = useToast();
  const invalidate = useInvalidateCollectiveInvoices();
  const { page, setPage, q, setQ, sort, order, toggleSort, pageSize } = useListState("invoice_date", 25, {
    defaultOrder: "desc",
  });
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [transInvoiceId, setTransInvoiceId] = createSignal<number | null>(null);
  const [batching, setBatching] = createSignal(false);

  const list = useCollectiveInvoices(() => ({
    page: page(),
    pageSize,
    sort: sort(),
    order: order(),
    q: q() || undefined,
  }));

  const onAutoBatch = async () => {
    setBatching(true);
    const res = await autoBatchCollectiveInvoices();
    setBatching(false);
    if (!res.success) {
      toast.warning(res.message ?? "Auto-batch failed.");
      return;
    }
    const created = res.data?.created ?? 0;
    const skipped = res.data?.skipped ?? 0;
    toast.success(`Created ${created} invoice(s), skipped ${skipped}.`);
    invalidate();
  };

  return (
    <SalesLayout>
      <div class="mb-3 flex justify-end">
        <button
          type="button"
          class="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          disabled={batching()}
          onClick={() => void onAutoBatch()}
        >
          {batching() ? "Batching…" : "Batch eligible sales"}
        </button>
      </div>
      <SpreadsheetGrid
        columns={[
          { key: "date_no_display", header: "Date-No.", sortable: true, clickable: true },
          { key: "customer_name", header: "Customer/Vendor Name", sortable: true },
          {
            key: "subtotal",
            header: "Pretax Amount",
            sortable: true,
            render: (r: CollectiveInvoiceRow) => money(r.subtotal),
          },
          {
            key: "tax_total",
            header: "Sales Tax",
            render: (r: CollectiveInvoiceRow) => money(r.tax_total),
          },
          {
            key: "grand_total",
            header: "Total Sales",
            sortable: true,
            render: (r: CollectiveInvoiceRow) => money(r.grand_total),
          },
          {
            key: "view_trans",
            header: "View Trans.",
            sortable: false,
            render: (r: CollectiveInvoiceRow) => (
              <button
                type="button"
                class="text-brand-600 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  setTransInvoiceId(r.id);
                }}
              >
                View Trans.
              </button>
            ),
          },
          {
            key: "slip",
            header: "Sales Slip",
            sortable: false,
            render: (r: CollectiveInvoiceRow) => (
              <button
                type="button"
                class="text-brand-600 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  openSlipPrint(r.id);
                }}
              >
                Sales Slip
              </button>
            ),
          },
          {
            key: "print",
            header: "Print",
            sortable: false,
            render: (r: CollectiveInvoiceRow) => (
              <div class="flex gap-2">
                <button
                  type="button"
                  class="text-brand-600 hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    openInvoicePrint(r.id);
                  }}
                >
                  Invoice
                </button>
                <button
                  type="button"
                  class="text-brand-600 hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    openInvoicePrint(r.id, "ar_statement");
                  }}
                >
                  AR Stmt
                </button>
              </div>
            ),
          },
          {
            key: "history",
            header: "History",
            sortable: false,
            render: (r: CollectiveInvoiceRow) => (
              <ActivityHistoryLink
                module="sales"
                targetType="sa_collective_invoice"
                targetId={r.id}
                title={`History — ${r.date_no_display}`}
              />
            ),
          },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={() => {}}
        onNew={() => void onAutoBatch()}
        codeKey="date_no_display"
        nameKey="customer_name"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        page={page()}
        pageSize={pageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        search={q()}
        onSearchChange={setQ}
        searchPlaceholder="Search customer, receivable no…"
        onRefresh={invalidate}
        settingsHref={SALES_SETTINGS_HREF.sales}
      />
      <CollectiveInvoiceTransactionsModal invoiceId={transInvoiceId()} onClose={() => setTransInvoiceId(null)} />
    </SalesLayout>
  );
}
