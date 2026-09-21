import { createMemo, createSignal, onMount } from "solid-js";
import { A, useLocation, useNavigate, useSearchParams } from "@solidjs/router";
import { apiFetch } from "../../../shared/api";
import { GenerateOtherSlipsMenu } from "../../../shared/GenerateOtherSlipsMenu";
import { SpreadsheetGrid } from "../../../shared/SpreadsheetGrid";
import { QUOTATION_SETTINGS_HREF } from "../../../shared/entityTypes";
import { useTransactionListState } from "../../../shared/useListState";
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
import { formatMoney, fetchQuotationPrint, openQuotationPrint } from "./quotationPrint";
import { progressStatusLabel, voucherStatusLabel } from "./progressStatus";
import { SendEmailModal } from "../../comms/SendEmailModal";
import { buildDocumentEmailSubject, buildDocumentEmailBody, firstLineItemName, itemNameFromSummary } from "../../comms/documentEmailSubject";
import { hasPermission, useAuth } from "../../../shared/auth-context";
import { useDocumentLifecycle } from "../../../shared/documentLifecycle";

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
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const auth = useAuth();
  const canSendEmail = () => hasPermission(auth.me, "comms.send", "write");
  const invalidate = useInvalidateQuotations();

  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } = useTransactionListState(
    "updated_at",
  );
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<QuotationDetail | null>(null);
  const [viewingDeleted, setViewingDeleted] = createSignal(false);
  const [slipOpen, setSlipOpen] = createSignal(false);
  const [slipQuotationId, setSlipQuotationId] = createSignal<number | null>(null);
  const [emailOpen, setEmailOpen] = createSignal(false);
  const [emailQuotationId, setEmailQuotationId] = createSignal<number | null>(null);
  const [emailDefaultTo, setEmailDefaultTo] = createSignal("");
  const [emailDefaultSubject, setEmailDefaultSubject] = createSignal("");
  const [emailDefaultBody, setEmailDefaultBody] = createSignal("");

  const lifecycle = useDocumentLifecycle({
    apiBase: "/api/v1/quotation/quotations",
    documentLabel: "quotation",
    canManage: () => hasPermission(auth.me, "quotation.quotations", "write"),
    onChanged: invalidate,
  });

  const list = useQuotationList(() => ({
    page: page(),
    pageSize,
    sort: sort(),
    order: order(),
    q: q() || undefined,
    progressStatus: statusFilter() || undefined,
    lifecycle: lifecycle.filter(),
  }));

  const quotationIds = createMemo(() => (list.data?.rows ?? []).map((r) => r.id));
  const taskSummaries = useCrmTaskSummaries(() => ({ quotationIds: quotationIds() }));

  const selectedIds = createMemo(() => {
    const id = selectedId();
    return id != null ? [id] : [];
  });

  const openNew = () => {
    setEditing(null);
    setViewingDeleted(false);
    setModalOpen(true);
  };

  const openEdit = async (row: QuotationRow) => {
    const [res, deleted] = await Promise.all([
      apiFetch<QuotationDetail>(lifecycle.detailUrl(row.id)),
      lifecycle.resolveDeleted(row.id),
    ]);
    if (!res.success || !res.data) return;
    setEditing(res.data);
    setViewingDeleted(deleted);
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

  const openEmail = async (row: QuotationRow) => {
    const res = await fetchQuotationPrint(row.id);
    const q = res.data?.quotation;
    setEmailDefaultTo(res.data?.partner.email ?? "");
    setEmailDefaultSubject(
      buildDocumentEmailSubject(
        itemNameFromSummary(row.item_name_summary) || firstLineItemName(q?.lines),
        "Quotation",
        auth.me?.tenant.company_name ?? res.data?.tenant.company_name,
      ),
    );
    setEmailDefaultBody(
      buildDocumentEmailBody({
        docTypeLabel: "Quotation",
        partyLabel: "Customer",
        partyName: res.data?.partner.company_name ?? row.customer_name,
        referenceNo: q?.reference_no ?? row.reference_no,
        dateLabel: "Date",
        date: q?.order_date ?? row.order_date,
        currencyCode: q?.currency_code ?? row.currency_code,
        grandTotal: q?.grand_total ?? row.grand_total,
        paymentTerms: q?.payment_terms,
        notes: q?.notes,
        lines: q?.lines,
        companyName: auth.me?.tenant.company_name ?? res.data?.tenant.company_name,
      }),
    );
    setEmailQuotationId(row.id);
    setEmailOpen(true);
  };

  onMount(() => {
    if (props.openNewOnMount || loc.pathname.endsWith("/new")) openNew();
    const openId = Number(searchParams.openId ?? "");
    if (openId > 0) {
      void (async () => {
        const [res, deleted] = await Promise.all([
          apiFetch<QuotationDetail>(lifecycle.detailUrl(openId)),
          lifecycle.resolveDeleted(openId),
        ]);
        if (res.success && res.data) {
          setEditing(res.data);
          setViewingDeleted(deleted);
          setModalOpen(true);
        } else {
          toast.warning(res.message ?? "Could not open that quotation.");
        }
        setSearchParams({ openId: undefined }, { replace: true });
      })();
    }
  });

  return (
    <QuotationLayout>
      <div class="mb-3 rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-2 text-xs text-slate-700">
        Create and edit quote documents here. For a stage board of the same quotes, open{" "}
        <A href="/app/crm/pipelines/quotations" class="font-medium text-brand-700 hover:underline">
          Quote board
        </A>{" "}
        (CRM).
      </div>
      <SpreadsheetGrid
        columns={[
          { key: "date_no_display", header: "Document no.", clickable: true },
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
            key: "email",
            header: "Email",
            sortable: false,
            render: (r) =>
              canSendEmail() ? (
                <button
                  type="button"
                  class="text-brand-600 hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    void openEmail(r);
                  }}
                >
                  Email
                </button>
              ) : (
                ""
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
          {
            key: "lifecycle",
            header: "Manage",
            sortable: false,
            render: (r) => <lifecycle.RowAction id={r.id} label={r.reference_no || r.date_no_display} />,
          },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        selectable
        selectedIds={lifecycle.selectedIds()}
        onSelectionChange={lifecycle.onSelectionChange}
        onEdit={(row) => void openEdit(row)}
        onNew={openNew}
        newLabel="New Quotation"
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
          { value: "", label: "All" },
          { value: "e_approval", label: progressStatusLabel("e_approval") },
          { value: "unconfirmed", label: progressStatusLabel("unconfirmed") },
          { value: "in_progress", label: progressStatusLabel("in_progress") },
          { value: "completed", label: progressStatusLabel("completed") },
        ]}
        onRefresh={invalidate}
        settingsHref={QUOTATION_SETTINGS_HREF.quotation}
        toolbarExtra={
          <div class="flex flex-wrap items-end gap-2">
            <GenerateOtherSlipsMenu
              sourceEntity="quotation"
              targets={[{ label: "Sales Order", targetEntity: "sales_order" }]}
              selectedIds={selectedIds}
              onSuccess={() => invalidate()}
            />
            <lifecycle.BulkToolbar />
            <lifecycle.FilterControl />
          </div>
        }
      />

      <QuotationModal open={modalOpen()} editing={editing()} readOnly={viewingDeleted()} onClose={closeModal} onSaved={invalidate} />
      <lifecycle.Dialog />
      <lifecycle.BulkDialog />
      <CreatedSlipModal open={slipOpen()} quotationId={slipQuotationId()} onClose={() => setSlipOpen(false)} />
      <SendEmailModal
        open={emailOpen()}
        onClose={() => setEmailOpen(false)}
        title="Email quotation"
        sendUrl={`/api/v1/quotation/quotations/${emailQuotationId() ?? 0}/send-email`}
        defaultTo={emailDefaultTo()}
        defaultSubject={emailDefaultSubject()}
        defaultBody={emailDefaultBody()}
        onSent={invalidate}
      />
    </QuotationLayout>
  );
}

export default function QuotationListPage() {
  return <QuotationListPageInner />;
}
