import { createMemo, createSignal, Show } from "solid-js";
import { formatPeso } from "../../../shared/money";
import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "../../../shared/api";
import { SpreadsheetGrid } from "../../../shared/SpreadsheetGrid";
import { FINANCE_SETTINGS_HREF } from "../../../shared/entityTypes";
import { FinanceLayout } from "../FinanceLayout";

type Row = {
  supplier_invoice_id: number;
  date_no_display: string;
  invoice_no: string;
  vendor_name: string;
  grand_total: number;
  paid_amount: number;
  balance: number;
  payment_status: string;
};

type GridRow = Row & { id: number };



export default function SupplierPaymentStatusPage() {
  const [searched, setSearched] = createSignal(false);

  const report = createQuery(() => ({
    queryKey: ["supplier-payment-status"],
    enabled: searched(),
    queryFn: async () => {
      const res = await apiFetch<Row[]>("/api/v1/finance/supplier-payment-status?page=1&pageSize=200&sort=invoice_date&order=desc");
      if (!res.success) throw new Error(res.message ?? "Failed");
      return res.data ?? [];
    },
  }));

  const rows = createMemo<GridRow[]>(() =>
    (report.data ?? []).map((r) => ({ ...r, id: r.supplier_invoice_id })),
  );

  return (
    <FinanceLayout>
      <div class="mb-4">
        <button type="button" class="rounded bg-slate-900 px-4 py-2 text-sm text-white" onClick={() => setSearched(true)}>
          Run report (F8)
        </button>
      </div>
      <Show when={searched()}>
        <SpreadsheetGrid<GridRow>
          columns={[
            { key: "date_no_display", header: "Date-no" },
            { key: "invoice_no", header: "Invoice No." },
            { key: "vendor_name", header: "Vendor" },
            { key: "grand_total", header: "Grand total", render: (r) => formatPeso(r.grand_total) },
            { key: "paid_amount", header: "Paid", render: (r) => formatPeso(r.paid_amount) },
            { key: "balance", header: "Balance", render: (r) => formatPeso(r.balance) },
            { key: "payment_status", header: "Status" },
          ]}
          rows={rows()}
          loading={report.isFetching}
          selectedId={null}
          onSelect={() => {}}
          onEdit={() => {}}
          onNew={() => setSearched(true)}
          codeKey="invoice_no"
          nameKey="date_no_display"
          total={rows().length}
          page={1}
          pageSize={200}
          onPageChange={() => {}}
          settingsHref={FINANCE_SETTINGS_HREF.officialReceipt}
        />
      </Show>
    </FinanceLayout>
  );
}
