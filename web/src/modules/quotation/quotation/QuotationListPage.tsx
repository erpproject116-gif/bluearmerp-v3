import { createMemo, createSignal, onMount } from "solid-js";
import { useLocation, useNavigate } from "@solidjs/router";
import { apiFetch } from "../../../shared/api";
import { SpreadsheetGrid } from "../../../shared/SpreadsheetGrid";
import { QUOTATION_SETTINGS_HREF } from "../../../shared/entityTypes";
import { useListState } from "../../../shared/useListState";
import {
  patchQuotationProgress,
  useInvalidateQuotations,
  useQuotationList,
  type QuotationRow,
} from "../../../shared/useQuotationList";
import { useToast } from "../../../shared/toast";
import { ActivityHistoryLink } from "../../../shared/ActivityHistoryLink";
import { CrmTaskCell } from "../../../shared/CrmTaskCell";
import { useCrmTaskSummaries } from "../../../shared/useCrmTaskSummaries";
import { QuotationLayout } from "../QuotationLayout";
import { CreatedSlipModal } from "./CreatedSlipModal";
import { ProgressStatusMenu } from "./ProgressStatusMenu";
import { QuotationModal, type QuotationDetail } from "./QuotationModal";
import { formatMoney, openQuotationPrint } from "./quotationPrint";
import { progressStatusLabel, voucherStatusLabel } from "./progressStatus";

type PageOptions = {
  openNewOnMount?: boolean;
};

function formatValidity(row: QuotationRow): string {
  if (row.quotation_validity_text) return row.quotation_validity_text;
  if (row.valid_until) {
    const [y, m, d] = row.valid_until.split("-");
    if (y && m && d) return `${m}/${d}/${y}`;
  }
  return "";
}

export function QuotationListPageInner(props: PageOptions = {}) {
  const loc = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const invalidate = useInvalidateQuotations();

  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } = useListState(
    "order_date",
    25,
    { defaultOrder: "desc" },
  );
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<QuotationDetail | null>(null);
  const [slipOpen, setSlipOpen] = createSignal(false);
  const [slipQuotationId, setSlipQuotationId] = createSignal<number | null>(null);

  const list = useQuotationList(() => ({
    page: page(),
    pageSize,
    sort: sort(),
    order: order(),
    q: q() || undefined,
    progressStatus: statusFilter() || undefined,
  }));

  const quotationIds = createMemo(() => (list.data?.rows ?? []).map((r) => r.id));
  const taskSummaries = useCrmTaskSummaries(() => ({ quotationIds: quotationIds() }));

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = async (row: QuotationRow) => {
    const res = await apiFetch<QuotationDetail>(`/api/v1/quotation/quotations/${row.id}`);
    if (!res.success || !res.data) return;
    setEditing(res.data);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    if (loc.pathname.endsWith("/new")) {
      navigate("/app/quotation/quotations", { replace: true });
    }
  };

  const onProgressChange = async (row: QuotationRow, status: string) => {
    const res = await patchQuotationProgress(row.id, status);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to update progress.");
      return;
    }
    invalidate();
  };

  onMount(() => {
    if (props.openNewOnMount || loc.pathname.endsWith("/new")) openNew();
  });

  return (
    <QuotationLayout>
      <SpreadsheetGrid
        columns={[
          { key: "date_no_display", header: "Date-no", clickable: true },
          { key: "tax_type_name", header: "Transaction Type" },
          { key: "reference_no", header: "Reference No.", clickable: true },
          { key: "customer_name", header: "Customer" },
          { key: "item_name_summary", header: "Item Name" },
          {
            key: "quotation_validity_text",
            header: "Validity",
            sortable: false,
            render: (r) => formatValidity(r),
          },
          {
            key: "grand_total",
            header: "Grand Total",
            render: (r) => formatMoney(r.grand_total, r.currency_code),
          },
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
          {
            key: "voucher_status",
            header: "Voucher",
            sortable: false,
            render: (r) => voucherStatusLabel(r.voucher_status),
          },
          {
            key: "created_slip",
            header: "Created Slip",
            sortable: false,
            render: (r) => (
              <button
                type="button"
                class="text-brand-600 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  setSlipQuotationId(r.id);
                  setSlipOpen(true);
                }}
              >
                View
              </button>
            ),
          },
          { key: "created_by_name", header: "Creator", render: (r) => r.created_by_name ?? "" },
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
                  openQuotationPrint(r.id);
                }}
              >
                Print
              </button>
            ),
          },
          {
            key: "crm_task",
            header: "CRM",
            sortable: false,
            render: (r) => (
              <CrmTaskCell
                summary={taskSummaries.data?.by_quotation[String(r.id)]}
                context={{
                  task_type: "quote_follow_up",
                  quotation_id: r.id,
                  partner_id: r.partner_id,
                  partner_name: r.customer_name,
                  pic_name: r.pic_name,
                  title: `Follow up — ${r.reference_no}`,
                }}
              />
            ),
          },
          {
            key: "history",
            header: "History",
            sortable: false,
            render: (r) => (
              <ActivityHistoryLink module="quotation" targetType="quo_quotation" targetId={r.id} />
            ),
          },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={(row) => void openEdit(row)}
        onNew={openNew}
        codeKey="reference_no"
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
        searchPlaceholder="Search reference, customer, item…"
        status={statusFilter()}
        onStatusChange={setStatusFilter}
        statusLabel="Progress"
        statusOptions={[
          { value: "unconfirmed", label: progressStatusLabel("unconfirmed") },
          { value: "in_progress", label: progressStatusLabel("in_progress") },
          { value: "completed", label: progressStatusLabel("completed") },
          { value: "", label: "All" },
        ]}
        onRefresh={invalidate}
        settingsHref={QUOTATION_SETTINGS_HREF.quotation}
      />

      <QuotationModal open={modalOpen()} editing={editing()} onClose={closeModal} onSaved={invalidate} />
      <CreatedSlipModal open={slipOpen()} quotationId={slipQuotationId()} onClose={() => setSlipOpen(false)} />
    </QuotationLayout>
  );
}

export default function QuotationListPage() {
  return <QuotationListPageInner />;
}
