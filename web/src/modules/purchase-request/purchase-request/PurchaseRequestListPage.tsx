import { createMemo, createSignal, onMount, Show } from "solid-js";
import { useLocation, useNavigate } from "@solidjs/router";
import { apiFetch } from "../../../shared/api";
import { GenerateOtherSlipsMenu } from "../../../shared/GenerateOtherSlipsMenu";
import { SpreadsheetGrid } from "../../../shared/SpreadsheetGrid";
import { PURCHASE_REQUEST_SETTINGS_HREF } from "../../../shared/entityTypes";
import {
  patchPurchaseRequestProgress,
  useInvalidatePurchaseRequests,
  usePurchaseRequestList,
  type PurchaseRequestRow,
} from "../../../shared/usePurchaseRequestList";
import { useToast } from "../../../shared/toast";
import { ActivityHistoryLink } from "../../../shared/ActivityHistoryLink";
import { CrmTaskCell } from "../../../shared/CrmTaskCell";
import { useCrmTaskSummaries } from "../../../shared/useCrmTaskSummaries";
import { PurchaseRequestLayout } from "../PurchaseRequestLayout";
import { CreatedSlipModal } from "./CreatedSlipModal";
import { ProgressStatusMenu } from "./ProgressStatusMenu";
import { PurchaseRequestListFilter } from "./PurchaseRequestListFilter";
import { PurchaseRequestModal, type PurchaseRequestDetail } from "./PurchaseRequestModal";
import { defaultListFilters, type PurchaseRequestListFilters } from "./purchaseRequestListFilters";
import { formatMoney, openPurchaseRequestPrint } from "./purchaseRequestPrint";
import { progressStatusLabel } from "./progressStatus";
import { hasPermission, useAuth } from "../../../shared/auth-context";
import { useDocumentLifecycle } from "../../../shared/documentLifecycle";

type PageOptions = {
  openNewOnMount?: boolean;
};

const PROGRESS_TABS = [
  { value: "", label: "All" },
  { value: "unconfirmed", label: progressStatusLabel("unconfirmed") },
  { value: "e_approval", label: progressStatusLabel("e_approval") },
  { value: "confirmed", label: progressStatusLabel("confirmed") },
  { value: "in_progress", label: progressStatusLabel("in_progress") },
  { value: "completed", label: progressStatusLabel("completed") },
];

export function PurchaseRequestListPageInner(props: PageOptions = {}) {
  const loc = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const auth = useAuth();
  const invalidate = useInvalidatePurchaseRequests();

  const [draftFilters, setDraftFilters] = createSignal<PurchaseRequestListFilters>(defaultListFilters());
  const [submittedFilters, setSubmittedFilters] = createSignal<PurchaseRequestListFilters | null>(null);
  const [progressTab, setProgressTab] = createSignal("");
  const [page, setPage] = createSignal(1);
  const [sort, setSort] = createSignal("request_date");
  const [order, setOrder] = createSignal<"asc" | "desc">("desc");
  const pageSize = 25;

  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<PurchaseRequestDetail | null>(null);
  const [viewingDeleted, setViewingDeleted] = createSignal(false);
  const [slipOpen, setSlipOpen] = createSignal(false);
  const [slipPurchaseRequestId, setSlipPurchaseRequestId] = createSignal<number | null>(null);

  const activeFilters = createMemo(() => {
    const base = submittedFilters();
    if (!base) return null;
    return { ...base, progress_status: progressTab() || base.progress_status };
  });

  const lifecycle = useDocumentLifecycle({
    apiBase: "/api/v1/purchase-request/purchase-requests",
    documentLabel: "purchase request",
    canManage: () => hasPermission(auth.me, "purchase_request.purchase_requests", "write"),
    onChanged: invalidate,
  });

  const list = usePurchaseRequestList(() => {
    const f = activeFilters();
    return {
      page: page(),
      pageSize,
      sort: f?.sort_by_modified ? "updated_at" : sort(),
      order: f?.sort_by_modified ? "desc" : order(),
      q: f?.q,
      progressStatus: f?.progress_status,
      date_from: f?.date_from,
      date_to: f?.date_to,
      purchase_request_no: f?.purchase_request_no,
      domestic_foreign: f?.domestic_foreign !== "all" ? f?.domestic_foreign : undefined,
      location_id: f?.location_id ?? undefined,
      project_id: f?.project_id ?? undefined,
      partner_id: f?.partner_id ?? undefined,
      item_id: f?.item_id ?? undefined,
      send_status: f?.send_status !== "all" ? f?.send_status : undefined,
      sort_by_modified: f?.sort_by_modified,
      lifecycle: lifecycle.filter(),
    };
  });

  const purchaseRequestIds = createMemo(() => (list.data?.rows ?? []).map((r) => r.id));
  const taskSummaries = useCrmTaskSummaries(() => ({ purchaseRequestIds: purchaseRequestIds() }));

  const selectedIds = createMemo(() => {
    const id = selectedId();
    return id != null ? [id] : [];
  });

  const search = () => {
    setSubmittedFilters({ ...draftFilters() });
    setProgressTab("");
    setPage(1);
    invalidate();
  };

  const reset = () => {
    setDraftFilters(defaultListFilters());
    setSubmittedFilters(null);
    setProgressTab("");
    setPage(1);
  };

  const openNew = () => {
    setEditing(null);
    setViewingDeleted(false);
    setModalOpen(true);
  };

  const openEdit = async (row: PurchaseRequestRow) => {
    const [res, deleted] = await Promise.all([
      apiFetch<PurchaseRequestDetail>(lifecycle.detailUrl(row.id)),
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
      navigate("/app/purchase-request/purchase-requests", { replace: true });
    }
  };

  const onProgressChange = async (row: PurchaseRequestRow, status: string) => {
    const res = await patchPurchaseRequestProgress(row.id, status);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to update progress.");
      return;
    }
    invalidate();
  };

  const toggleSort = (key: string) => {
    if (sort() === key) setOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setOrder("asc");
    }
  };

  onMount(() => {
    if (props.openNewOnMount || loc.pathname.endsWith("/new")) openNew();
  });

  return (
    <PurchaseRequestLayout>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 class="text-lg font-semibold text-text-primary">Purchase Requests</h1>
        <button
          type="button"
          class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          onClick={openNew}
        >
          + New Purchase Request
        </button>
      </div>
      <PurchaseRequestListFilter value={draftFilters} onChange={setDraftFilters} onSearch={search} onReset={reset} />

      <Show when={submittedFilters()}>
        <div class="mt-6">
          <SpreadsheetGrid
            columns={[
              { key: "date_no_display", header: "Date-No", clickable: true },
              { key: "purchase_request_no", header: "PR No.", clickable: true },
              { key: "pic_name", header: "PIC" },
              { key: "partner_name", header: "Customer/Vendor" },
              { key: "item_name_summary", header: "Item" },
              {
                key: "total_qty",
                header: "Total Qty",
                render: (r) => r.total_qty.toLocaleString("en-PH", { maximumFractionDigits: 4 }),
              },
              {
                key: "grand_total",
                header: "Total Amount",
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
                key: "crm_task",
                header: "Task",
                sortable: false,
                render: (r) => (
                  <CrmTaskCell
                    summary={taskSummaries.data?.by_purchase_request[String(r.id)]}
                    context={{
                      purchase_request_id: r.id,
                      partner_id: r.partner_id,
                      partner_name: r.partner_name,
                      pic_name: r.pic_name,
                      title: `Follow up — ${r.purchase_request_no}`,
                    }}
                  />
                ),
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
                      setSlipPurchaseRequestId(r.id);
                      setSlipOpen(true);
                    }}
                  >
                    View
                  </button>
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
                      openPurchaseRequestPrint(r.id);
                    }}
                  >
                    Print
                  </button>
                ),
              },
              {
                key: "history",
                header: "History",
                sortable: false,
                render: (r) => (
                  <ActivityHistoryLink module="purchase_request" targetType="pr_purchase_request" targetId={r.id} />
                ),
              },
              {
                key: "lifecycle",
                header: "Manage",
                sortable: false,
                render: (r) => <lifecycle.RowAction id={r.id} label={r.purchase_request_no || r.date_no_display} />,
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
            codeKey="purchase_request_no"
            nameKey="date_no_display"
            sortKey={sort()}
            sortOrder={order()}
            onSort={toggleSort}
            page={page()}
            pageSize={pageSize}
            total={list.data?.total ?? 0}
            onPageChange={setPage}
            status={progressTab()}
            onStatusChange={(status) => {
              setProgressTab(status);
              setPage(1);
            }}
            statusLabel="Progress"
            statusOptions={PROGRESS_TABS}
            onRefresh={invalidate}
            settingsHref={PURCHASE_REQUEST_SETTINGS_HREF.purchaseRequest}
            toolbarExtra={
              <div class="flex flex-wrap items-end gap-2">
                <GenerateOtherSlipsMenu
                  sourceEntity="purchase_request"
                  targets={[{ label: "Purchase Order", targetEntity: "purchase_order" }]}
                  selectedIds={selectedIds}
                  onSuccess={() => invalidate()}
                />
                <lifecycle.BulkToolbar />
                <lifecycle.FilterControl />
              </div>
            }
          />
        </div>
      </Show>

      <PurchaseRequestModal open={modalOpen()} editing={editing()} readOnly={viewingDeleted()} onClose={closeModal} onSaved={invalidate} />
      <lifecycle.Dialog />
      <lifecycle.BulkDialog />
      <CreatedSlipModal open={slipOpen()} purchaseRequestId={slipPurchaseRequestId()} onClose={() => setSlipOpen(false)} />
    </PurchaseRequestLayout>
  );
}

export default function PurchaseRequestListPage() {
  return <PurchaseRequestListPageInner />;
}
