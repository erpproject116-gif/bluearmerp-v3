import { createResource, createSignal } from "solid-js";
import { apiFetch } from "../../shared/api";
import { SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { useListState } from "../../shared/useListState";
import { CommsLayout } from "./CommsLayout";

export type InboxMessageRow = {
  id: number;
  direction: string;
  from_addr: string;
  to_addrs: string[];
  subject: string;
  snippet: string;
  linked_doc_type?: string | null;
  linked_doc_id?: number | null;
  owner_name?: string;
  is_stub?: boolean;
  internal_date?: string | null;
  synced_at: string;
};

function formatWhen(row: InboxMessageRow): string {
  const iso = row.internal_date ?? row.synced_at;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function formatAddrs(addrs?: string[]): string {
  return (addrs ?? []).join(", ");
}

function docLabel(row: InboxMessageRow): string {
  if (!row.linked_doc_type || !row.linked_doc_id) return "";
  return `${row.linked_doc_type} #${row.linked_doc_id}`;
}

export default function CommsInboxPage() {
  const { page, setPage, q, setQ, sort, order, toggleSort, pageSize, setPageSize } = useListState("internal_date", 25, {
    defaultOrder: "desc",
  });
  const [selectedId, setSelectedId] = createSignal<number | null>(null);

  const [list, { refetch }] = createResource(
    () => ({ page: page(), q: q() }),
    async ({ page: p, q: query }) => {
      const qs = new URLSearchParams({
        page: String(p),
        pageSize: String(pageSize()),
      });
      if (query) qs.set("q", query);
      const res = await apiFetch<InboxMessageRow[]>(`/api/v1/comms/inbox?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load inbox.");
      return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
    },
  );

  return (
    <CommsLayout>
      <SpreadsheetGrid
        columns={[
          { key: "internal_date", header: "Date", render: (r) => formatWhen(r) },
          { key: "direction", header: "Dir", sortable: false },
          { key: "from_addr", header: "From" },
          { key: "to_addrs", header: "To", sortable: false, render: (r) => formatAddrs(r.to_addrs) },
          { key: "subject", header: "Subject", clickable: true },
          { key: "linked_doc_type", header: "Document", sortable: false, render: (r) => docLabel(r) },
          { key: "owner_name", header: "Mailbox" },
          {
            key: "is_stub",
            header: "Stub",
            sortable: false,
            render: (r) => (r.is_stub ? "Yes" : ""),
          },
        ]}
        rows={list()?.rows ?? []}
        loading={list.loading}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={() => {}}
        onNew={() => {}}
        showNew={false}
        codeKey="subject"
        nameKey="from_addr"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        page={page()}
        pageSize={pageSize()} onPageSizeChange={setPageSize}
        total={list()?.total ?? 0}
        onPageChange={setPage}
        search={q()}
        onSearchChange={setQ}
        searchPlaceholder="Search subject, sender, snippet…"
        onRefresh={() => void refetch()}
        settingsHref="/app/comms/settings"
      />
    </CommsLayout>
  );
}
