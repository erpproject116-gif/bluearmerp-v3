import { createSignal, Show } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { useListState } from "../../shared/useListState";
import { apiFetch } from "../../shared/api";
import { DataCenterLayout } from "./DataCenterLayout";

type IngestedDocument = {
  id: number;
  rule_id?: number | null;
  source_channel: string;
  match_status: string;
  status: string;
  generated_target_id?: number | null;
  created_at: string;
};

const STATUS_TABS = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "generated", label: "Generated" },
];

export default function InboxPage() {
  const { page, setPage, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize, setPageSize } = useListState(
    "created_at",
    25,
    { defaultOrder: "desc", defaultStatus: "" },
  );
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [generatingId, setGeneratingId] = createSignal<number | null>(null);
  const toast = useToast();
  const client = useQueryClient();

  const list = createQuery(() => {
    const qs = new URLSearchParams({
      page: String(page()),
      pageSize: String(pageSize()),
      sort: sort(),
      order: order(),
    });
    if (statusFilter()) qs.set("status", statusFilter());
    return {
      queryKey: ["data-center-inbox", page(), pageSize(), sort(), order(), statusFilter()],
      queryFn: async () => {
        const res = await apiFetch<IngestedDocument[]>(`/api/v1/data-center/inbox?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load inbox");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
    };
  });

  const invalidate = () => void client.invalidateQueries({ queryKey: ["data-center-inbox"] });

  const generate = async (row: IngestedDocument) => {
    setGeneratingId(row.id);
    const res = await apiFetch(`/api/v1/data-center/inbox/${row.id}/generate`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    setGeneratingId(null);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to generate.");
      return;
    }
    toast.success("Document generated.");
    invalidate();
  };

  return (
    <DataCenterLayout>
      <SpreadsheetGrid<IngestedDocument>
        columns={[
          { key: "id", header: "ID" },
          { key: "source_channel", header: "Channel" },
          { key: "match_status", header: "Match" },
          { key: "status", header: "Status" },
          { key: "created_at", header: "Created" },
          {
            key: "actions",
            header: "",
            sortable: false,
            render: (r) => (
              <Show when={r.status !== "generated"}>
                <button
                  type="button"
                  class="rounded border border-stroke px-2 py-0.5 text-xs font-medium text-brand-600 disabled:opacity-50"
                  disabled={generatingId() === r.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    void generate(r);
                  }}
                >
                  Generate
                </button>
              </Show>
            ),
          },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onNew={() => {}}
        showNew={false}
        onEdit={() => {}}
        settingsHref="/app/data-center/inbox"
        codeKey="id"
        nameKey="source_channel"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        page={page()}
        pageSize={pageSize()} onPageSizeChange={setPageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        status={statusFilter()}
        onStatusChange={setStatusFilter}
        statusLabel="Status"
        statusOptions={STATUS_TABS}
        onRefresh={invalidate}
      />
    </DataCenterLayout>
  );
}
