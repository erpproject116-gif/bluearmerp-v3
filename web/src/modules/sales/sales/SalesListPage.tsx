import { createMemo, createSignal, onMount } from "solid-js";
import { useLocation, useNavigate, useSearchParams } from "@solidjs/router";
import { apiFetch } from "../../../shared/api";
import { SpreadsheetGrid } from "../../../shared/SpreadsheetGrid";
import { SALES_SETTINGS_HREF } from "../../../shared/entityTypes";
import { useListState } from "../../../shared/useListState";
import {
  patchSalesInvoicing,
  patchSalesProgress,
  useInvalidateSales,
  useSalesList,
  type SalesRow,
} from "../../../shared/useSalesList";
import { useToast } from "../../../shared/toast";
import { ActivityHistoryLink } from "../../../shared/ActivityHistoryLink";
import { createCollectiveInvoice } from "../../../shared/useCollectiveInvoices";
import { CrmTaskCell } from "../../../shared/CrmTaskCell";
import { useCrmTaskSummaries } from "../../../shared/useCrmTaskSummaries";
import { SalesLayout } from "../SalesLayout";
import { ProgressStatusMenu } from "./ProgressStatusMenu";
import { SalesModal, type SalesDetail } from "./SalesModal";
import { formatMoney, openSalesPrint } from "./salesPrint";
import type { SalesTemplateCode } from "./SalesLineGrid";
import { hasPermission, useAuth } from "../../../shared/auth-context";
import { useDocumentLifecycle } from "../../../shared/documentLifecycle";

type PageOptions = {
  openNewOnMount?: boolean;
  templateCode?: SalesTemplateCode;
};

export function SalesListPageInner(props: PageOptions = {}) {
  const loc = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const auth = useAuth();
  const invalidate = useInvalidateSales();

  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } = useListState(
    "order_date",
    25,
    { defaultOrder: "desc" },
  );
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [checkedIds, setCheckedIds] = createSignal<Set<number>>(new Set());
  const [creatingInvoice, setCreatingInvoice] = createSignal(false);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<SalesDetail | null>(null);
  const [viewingDeleted, setViewingDeleted] = createSignal(false);
  const [templateCode, setTemplateCode] = createSignal<SalesTemplateCode>(props.templateCode ?? "default");

  const lifecycle = useDocumentLifecycle({
    apiBase: "/api/v1/sales",
    documentLabel: "sales invoice",
    canManage: () => hasPermission(auth.me, "sales.sales", "write"),
    onChanged: invalidate,
  });

  const list = useSalesList(() => ({
    page: page(),
    pageSize,
    sort: sort(),
    order: order(),
    q: q() || undefined,
    progressStatus: statusFilter() || undefined,
    lifecycle: lifecycle.filter(),
  }));

  const salesIds = createMemo(() => (list.data?.rows ?? []).map((r) => r.id));
  const taskSummaries = useCrmTaskSummaries(() => ({ salesIds: salesIds() }));

  const openNew = () => {
    setEditing(null);
    setViewingDeleted(false);
    setModalOpen(true);
  };

  const openEdit = async (row: SalesRow) => {
    const [res, deleted] = await Promise.all([
      apiFetch<SalesDetail>(lifecycle.detailUrl(row.id)),
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
      navigate("/app/sales/sales", { replace: true });
    }
  };

  const onProgressChange = async (row: SalesRow, status: string) => {
    const res = await patchSalesProgress(row.id, status);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to update progress.");
      return;
    }
    invalidate();
  };

  const onInvoicingToggle = async (row: SalesRow) => {
    const res = await patchSalesInvoicing(row.id, !row.invoicing_status);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to update invoicing status.");
      return;
    }
    invalidate();
  };

  const toggleChecked = (id: number) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onCreateCollectiveInvoice = async () => {
    const ids = [...checkedIds()];
    if (!ids.length) {
      toast.warning("Select at least one sale.");
      return;
    }
    setCreatingInvoice(true);
    const res = await createCollectiveInvoice(ids);
    setCreatingInvoice(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to create collective invoice.");
      return;
    }
    toast.success("Collective invoice created.");
    setCheckedIds(new Set<number>());
    invalidate();
  };

  onMount(() => {
    if (props.templateCode) setTemplateCode(props.templateCode);
    if (props.openNewOnMount || loc.pathname.endsWith("/new")) openNew();
    const openId = Number(searchParams.openId ?? "");
    if (openId > 0) {
      void (async () => {
        const res = await apiFetch<SalesDetail>(`/api/v1/sales/${openId}`);
        if (res.success && res.data) {
          setEditing(res.data);
          setModalOpen(true);
        } else {
          toast.warning(res.message ?? "Could not open that sale.");
        }
        setSearchParams({ openId: undefined }, { replace: true });
      })();
    }
  });

  return (
    <SalesLayout>
      <div class="mb-3 flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          disabled={creatingInvoice() || checkedIds().size === 0}
          onClick={() => void onCreateCollectiveInvoice()}
        >
          {creatingInvoice() ? "Creating…" : `Create collective invoice (${checkedIds().size})`}
        </button>
      </div>
      <SpreadsheetGrid
        columns={[
          {
            key: "pick",
            header: "",
            sortable: false,
            render: (r) => (
              <input
                type="checkbox"
                checked={checkedIds().has(r.id)}
                disabled={r.invoicing_status || r.progress_status !== "completed"}
                onClick={(e) => e.stopPropagation()}
                onChange={() => toggleChecked(r.id)}
              />
            ),
          },
          {
            key: "progress_status",
            header: "Progress",
            sortable: false,
            render: (r) => (
              <ProgressStatusMenu
                class="rounded border border-stroke bg-white px-2 py-1 text-sm text-brand-600"
                value={r.progress_status}
                disabled={r.progress_status === "e_approval"}
                onChange={(status) => void onProgressChange(r, status)}
              />
            ),
          },
          { key: "date_no_display", header: "Date-no", clickable: true },
          { key: "due_date", header: "Due Date", render: (r) => r.due_date ?? "" },
          { key: "payment_terms", header: "Payment Terms", render: (r) => r.payment_terms ?? "" },
          { key: "si_dr_no", header: "SI/DR No.", render: (r) => r.si_dr_no ?? "" },
          { key: "tax_type_name", header: "Tax Type" },
          { key: "customer_name", header: "Customer" },
          { key: "item_name_summary", header: "Item Name" },
          {
            key: "grand_total",
            header: "Grand Total",
            render: (r) => formatMoney(r.grand_total, r.currency_code),
          },
          {
            key: "invoicing_status",
            header: "Invoicing",
            sortable: false,
            render: (r) => (
              <button
                type="button"
                class="text-lg leading-none"
                title={r.invoicing_status ? "Invoiced — click to mark not invoiced" : "Not invoiced — click to mark invoiced"}
                onClick={(e) => {
                  e.stopPropagation();
                  void onInvoicingToggle(r);
                }}
              >
                {r.invoicing_status ? "✓" : "✗"}
              </button>
            ),
          },
          { key: "location_name", header: "Location", render: (r) => r.location_name ?? "" },
          { key: "created_by_name", header: "Creator", render: (r) => r.created_by_name ?? "" },
          { key: "pic_name", header: "PIC" },
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
                  openSalesPrint(r.id);
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
                summary={taskSummaries.data?.by_sales[String(r.id)]}
                context={{
                  sales_id: r.id,
                  partner_id: r.partner_id,
                  partner_name: r.customer_name,
                  pic_name: r.pic_name,
                  title: `Follow up — ${r.sales_no}`,
                }}
              />
            ),
          },
          {
            key: "history",
            header: "History",
            sortable: false,
            render: (r) => (
              <ActivityHistoryLink module="sales" targetType="sa_sales" targetId={r.id} />
            ),
          },
          {
            key: "lifecycle",
            header: "Manage",
            sortable: false,
            render: (r) => <lifecycle.RowAction id={r.id} label={r.sales_no || r.date_no_display} />,
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
        codeKey="sales_no"
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
        searchPlaceholder="Search sales no., customer, SI/DR, item…"
        status={statusFilter()}
        onStatusChange={setStatusFilter}
        statusLabel="Status"
        statusOptions={[
          { value: "", label: "All" },
          { value: "e_approval", label: "E-Approval" },
          { value: "unconfirmed", label: "Unconfirmed" },
          { value: "completed", label: "Confirm" },
        ]}
        onRefresh={invalidate}
        settingsHref={SALES_SETTINGS_HREF.sales}
        toolbarExtra={
          <div class="flex flex-wrap items-end gap-2">
            <lifecycle.BulkToolbar />
            <lifecycle.FilterControl />
          </div>
        }
      />

      <SalesModal
        open={modalOpen()}
        editing={editing()}
        templateCode={templateCode()}
        readOnly={viewingDeleted()}
        onClose={closeModal}
        onSaved={invalidate}
      />
      <lifecycle.Dialog />
      <lifecycle.BulkDialog />
    </SalesLayout>
  );
}

export default function SalesListPage() {
  return <SalesListPageInner />;
}
