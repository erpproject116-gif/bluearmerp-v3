import { createSignal, onMount } from "solid-js";
import { useLocation, useNavigate } from "@solidjs/router";
import { SpreadsheetGrid } from "../../../shared/SpreadsheetGrid";
import { FINANCE_SETTINGS_HREF } from "../../../shared/entityTypes";
import { useListState } from "../../../shared/useListState";
import {
  useInvalidateSupplierInvoices,
  useSupplierInvoiceList,
  type SupplierInvoiceRow,
} from "../../../shared/useSupplierInvoiceList";
import { FinanceLayout } from "../FinanceLayout";
import { SupplierInvoiceModal } from "./SupplierInvoiceModal";

function money(n: number, currency?: string) {
  const formatted = n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${currency} ${formatted}` : formatted;
}

type PageOptions = { openNewOnMount?: boolean };

export function SupplierInvoiceListPageInner(props: PageOptions = {}) {
  const loc = useLocation();
  const navigate = useNavigate();
  const invalidate = useInvalidateSupplierInvoices();
  const { page, setPage, q, setQ, sort, order, toggleSort, pageSize } = useListState("invoice_date", 25, {
    defaultOrder: "desc",
  });
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);

  const list = useSupplierInvoiceList(() => ({
    page: page(),
    pageSize,
    sort: sort(),
    order: order(),
    q: q() || undefined,
  }));

  const openNew = () => setModalOpen(true);

  const closeModal = () => {
    setModalOpen(false);
    if (loc.pathname.endsWith("/new")) navigate("/app/finance/supplier-invoices", { replace: true });
  };

  onMount(() => {
    if (props.openNewOnMount || loc.pathname.endsWith("/new")) openNew();
  });

  return (
    <FinanceLayout>
      <SpreadsheetGrid<SupplierInvoiceRow>
        columns={[
          { key: "date_no_display", header: "Date-no", clickable: true },
          { key: "invoice_no", header: "Invoice No.", clickable: true },
          { key: "vendor_name", header: "Vendor" },
          { key: "vendor_invoice_no", header: "Vendor ref", render: (r) => r.vendor_invoice_no ?? "" },
          { key: "grand_total", header: "Amount", render: (r) => money(r.grand_total, r.currency_code) },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={() => {}}
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
        onRefresh={invalidate}
        settingsHref={FINANCE_SETTINGS_HREF.officialReceipt}
      />
      <SupplierInvoiceModal open={modalOpen()} onClose={closeModal} onSaved={() => { invalidate(); closeModal(); }} />
    </FinanceLayout>
  );
}

export default function SupplierInvoiceListPage() {
  return <SupplierInvoiceListPageInner />;
}
