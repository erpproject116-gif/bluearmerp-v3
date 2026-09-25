import { createSignal, For } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { useListState } from "../../shared/useListState";
import { useToast } from "../../shared/toast";
import { QualityLayout } from "./QualityLayout";
import { progressStatusLabel } from "../../shared/branding/progressStatus";

type QcRequest = {
  id: number;
  request_no: string;
  request_date: string;
  source_type: string;
  partner_name?: string;
  item_code?: string;
  item_name?: string;
  progress_status: string;
};

const STATUS_TABS = [
  { value: "", label: "All" },
  { value: "e_approval", label: progressStatusLabel("e_approval") },
  { value: "unconfirmed", label: progressStatusLabel("unconfirmed") },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
];

export default function QcRequestsPage() {
  const toast = useToast();
  const client = useQueryClient();
  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize, setPageSize } =
    useListState("request_date", 25, { defaultOrder: "desc", defaultStatus: "" });
  const [selectedId, setSelectedId] = createSignal<number | null>(null);

  const list = createQuery(() => {
    const qs = new URLSearchParams({
      page: String(page()),
      pageSize: String(pageSize()),
      sort: sort(),
      order: order(),
    });
    if (q()) qs.set("q", q());
    if (statusFilter()) qs.set("progress_status", statusFilter());
    return {
      queryKey: ["qc-requests", page(), pageSize(), sort(), order(), q(), statusFilter()],
      queryFn: async () => {
        const res = await apiFetch<QcRequest[]>(`/api/v1/quality/qc-requests?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
    };
  });

  const invalidate = () => void client.invalidateQueries({ queryKey: ["qc-requests"] });

  const patchStatus = async (row: QcRequest, status: string) => {
    const res = await apiFetch(`/api/v1/quality/qc-requests/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({ progress_status: status }),
    });
    if (!res.success) {
      toast.warning(res.message ?? "Failed to update status.");
      return;
    }
    invalidate();
  };

  return (
    <QualityLayout>
      <div class="mb-4 flex flex-wrap gap-2">
        <For each={STATUS_TABS}>
          {(tab) => (
            <button
              type="button"
              class={`rounded-full px-3 py-1 text-sm ${statusFilter() === tab.value ? "bg-brand-600 text-white" : "border border-stroke text-text-secondary"}`}
              onClick={() => setStatusFilter(tab.value)}
            >
              {tab.label}
            </button>
          )}
        </For>
      </div>
      <SpreadsheetGrid<QcRequest>
        columns={[
          { key: "request_no", header: "Request No.", clickable: true },
          { key: "request_date", header: "Date" },
          { key: "source_type", header: "Source" },
          { key: "partner_name", header: "Partner" },
          { key: "item_code", header: "Item" },
          {
            key: "progress_status",
            header: "Status",
            sortable: false,
            render: (r) => (
              <select
                class="rounded border border-stroke bg-white px-2 py-1 text-sm"
                value={r.progress_status}
                onChange={(e) => void patchStatus(r, e.currentTarget.value)}
              >
                <option value="e_approval">e-Approval</option>
                <option value="unconfirmed">Unconfirmed</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            ),
          },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onNew={() => {}}
        onEdit={() => {}}
        settingsHref="/app/quality/qc-requests"
        codeKey="request_no"
        nameKey="partner_name"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        page={page()}
        pageSize={pageSize()} onPageSizeChange={setPageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        search={q()}
        onSearchChange={setQ}
        searchPlaceholder="Search request no. or partner…"
        onRefresh={invalidate}
      />
    </QualityLayout>
  );
}
