import { createSignal, onMount } from "solid-js";
import { useLocation, useNavigate } from "@solidjs/router";
import { apiFetch } from "../../../shared/api";
import { SpreadsheetGrid } from "../../../shared/SpreadsheetGrid";
import { FINANCE_SETTINGS_HREF } from "../../../shared/entityTypes";
import { useListState } from "../../../shared/useListState";
import {
  useInvalidateOfficialReceipts,
  useOfficialReceiptList,
  type OfficialReceiptRow,
} from "../../../shared/useOfficialReceiptList";
import { FinanceLayout } from "../FinanceLayout";
import { OfficialReceiptModal, type OfficialReceiptDetail } from "./OfficialReceiptModal";

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

export function OfficialReceiptListPageInner(props: PageOptions = {}) {
  const loc = useLocation();
  const navigate = useNavigate();
  const invalidate = useInvalidateOfficialReceipts();

  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } = useListState(
    "receipt_date",
    25,
    { defaultOrder: "desc" },
  );
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<OfficialReceiptDetail | null>(null);

  const list = useOfficialReceiptList(() => ({
    page: page(),
    pageSize,
    sort: sort(),
    order: order(),
    q: q() || undefined,
    paymentMethod: statusFilter() || undefined,
  }));

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = async (row: OfficialReceiptRow) => {
    const res = await apiFetch<OfficialReceiptDetail>(`/api/v1/finance/official-receipts/${row.id}`);
    if (!res.success || !res.data) return;
    setEditing(res.data);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    if (loc.pathname.endsWith("/new")) {
      navigate("/app/finance/official-receipts", { replace: true });
    }
  };

  onMount(() => {
    if (props.openNewOnMount || loc.pathname.endsWith("/new")) openNew();
  });

  return (
    <FinanceLayout>
      <SpreadsheetGrid
        columns={[
          { key: "date_no_display", header: "Date-no", clickable: true },
          { key: "receipt_no", header: "Receipt No.", clickable: true },
          { key: "customer_name", header: "Customer" },
          {
            key: "payment_method",
            header: "Payment",
            render: (r) => paymentLabel(r.payment_method),
          },
          { key: "reference_no", header: "Reference", render: (r) => r.reference_no ?? "" },
          {
            key: "amount_total",
            header: "Amount",
            render: (r) => money(r.amount_total, r.currency_code),
          },
          { key: "created_by_name", header: "Created by", render: (r) => r.created_by_name ?? "" },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={(row) => void openEdit(row)}
        onNew={openNew}
        codeKey="receipt_no"
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
        onStatusChange={setStatusFilter}
        statusLabel="Payment"
        statusOptions={[
          { value: "cash", label: "Cash" },
          { value: "check", label: "Check" },
          { value: "bank_transfer", label: "Bank Transfer" },
          { value: "", label: "All" },
        ]}
        onRefresh={invalidate}
        settingsHref={FINANCE_SETTINGS_HREF.officialReceipt}
      />

      <OfficialReceiptModal
        open={modalOpen()}
        editing={editing()}
        onClose={closeModal}
        onSaved={() => {
          invalidate();
          closeModal();
        }}
      />
    </FinanceLayout>
  );
}

export default function OfficialReceiptListPage() {
  return <OfficialReceiptListPageInner />;
}
