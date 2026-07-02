import { createSignal, onMount, Show } from "solid-js";
import { useLocation, useNavigate } from "@solidjs/router";
import { SpreadsheetGrid } from "../../../shared/SpreadsheetGrid";
import { FINANCE_SETTINGS_HREF } from "../../../shared/entityTypes";
import { useListState } from "../../../shared/useListState";
import {
  useInvalidatePaymentVouchers,
  usePaymentVoucherList,
  type PaymentVoucherRow,
} from "../../../shared/usePaymentVoucherList";
import { FinanceLayout } from "../FinanceLayout";
import { PaymentVoucherModal } from "./PaymentVoucherModal";

function money(n: number, currency?: string) {
  const formatted = n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${currency} ${formatted}` : formatted;
}

function paymentLabel(m: string) {
  if (m === "cash") return "Cash";
  if (m === "check") return "Check";
  if (m === "bank_transfer") return "Bank Transfer";
  return m;
}

type PageOptions = { openNewOnMount?: boolean };

export function PaymentVoucherListPageInner(props: PageOptions = {}) {
  const loc = useLocation();
  const navigate = useNavigate();
  const invalidate = useInvalidatePaymentVouchers();
  const { page, setPage, q, setQ, sort, order, toggleSort, pageSize } = useListState("payment_date", 25, {
    defaultOrder: "desc",
  });
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);

  const list = usePaymentVoucherList(() => ({
    page: page(),
    pageSize,
    sort: sort(),
    order: order(),
    q: q() || undefined,
  }));

  const openNew = () => setModalOpen(true);

  const closeModal = () => {
    setModalOpen(false);
    if (loc.pathname.endsWith("/new")) navigate("/app/finance/payment-vouchers", { replace: true });
  };

  onMount(() => {
    if (props.openNewOnMount || loc.pathname.endsWith("/new")) openNew();
  });

  return (
    <FinanceLayout>
      <Show when={selectedId()}>
        <div class="mb-3 flex justify-end">
          <a
            href={`/app/finance/payment-vouchers/${selectedId()}/2307`}
            target="_blank"
            rel="noopener noreferrer"
            class="rounded-lg border border-stroke bg-white px-3 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-50"
          >
            Print BIR 2307
          </a>
        </div>
      </Show>
      <SpreadsheetGrid<PaymentVoucherRow>
        columns={[
          { key: "date_no_display", header: "Date-no", clickable: true },
          { key: "payment_no", header: "Payment No.", clickable: true },
          { key: "vendor_name", header: "Vendor" },
          { key: "payment_method", header: "Method", render: (r) => paymentLabel(r.payment_method) },
          { key: "reference_no", header: "Reference", render: (r) => r.reference_no ?? "" },
          { key: "amount_total", header: "Amount", render: (r) => money(r.amount_total, r.currency_code) },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={() => {}}
        onNew={openNew}
        codeKey="payment_no"
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
      <PaymentVoucherModal open={modalOpen()} onClose={closeModal} onSaved={() => { invalidate(); closeModal(); }} />
    </FinanceLayout>
  );
}

export default function PaymentVoucherListPage() {
  return <PaymentVoucherListPageInner />;
}
