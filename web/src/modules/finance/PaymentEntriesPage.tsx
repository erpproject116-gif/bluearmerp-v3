import { createMemo, createSignal } from "solid-js";
import { A } from "@solidjs/router";
import { SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { useListState } from "../../shared/useListState";
import { usePaymentEntries, type PaymentEntry } from "../../shared/usePaymentEntries";
import { FinanceLayout } from "./FinanceLayout";

type PaymentEntryRow = PaymentEntry & { id: number };

export default function PaymentEntriesPage() {
  const { page, setPage, sort, order, toggleSort, pageSize, setPageSize } = useListState("entry_date");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);

  const list = usePaymentEntries(() => ({ page: page(), pageSize: pageSize() }));

  const rows = createMemo((): PaymentEntryRow[] =>
    (list.data?.rows ?? []).map((r) => ({
      ...r,
      id: r.entry_type === "official_receipt" ? r.id : r.id + 10_000_000,
    })),
  );
  const routeFor = (row: PaymentEntryRow) =>
    row.entry_type === "official_receipt"
      ? `/app/finance/official-receipts?highlight=${row.id}`
      : `/app/finance/payment-vouchers?highlight=${row.id}`;

  return (
    <FinanceLayout>
      <p class="mb-3 text-sm text-slate-600">
        Unified view of customer receipts (inbound) and supplier payments (outbound).
      </p>
      <SpreadsheetGrid
        columns={[
          { key: "entry_date", header: "Date" },
          { key: "direction", header: "Direction" },
          {
            key: "document_no",
            header: "Document no.",
            clickable: false,
            render: (r) => (
              <A class="text-brand-600 hover:underline" href={routeFor(r)}>
                {r.document_no}
              </A>
            ),
          },
          { key: "partner_name", header: "Party" },
          { key: "payment_method", header: "Method" },
          { key: "reference_no", header: "Reference", render: (r) => r.reference_no || "—" },
          { key: "amount", header: "Amount", render: (r) => String(r.amount) },
        ]}
        rows={rows()}
        loading={list.isFetching}
        exportFilename="payment-entries"
        exportTitle="Payment Entries"
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={() => {}}
        onNew={() => {}}
        codeKey="document_no"
        nameKey="partner_name"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        page={page()}
        pageSize={pageSize()} onPageSizeChange={setPageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
      />
    </FinanceLayout>
  );
}
