import { createResource, createSignal } from "solid-js";
import { apiFetch } from "../../shared/api";
import { SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { useListState } from "../../shared/useListState";
import { CommsLayout } from "./CommsLayout";

export type SentMessageRow = {
  id: number;
  channel: string;
  doc_type: string;
  doc_id: number;
  to_addrs: string[];
  cc_addrs?: string[];
  subject: string;
  body_text: string;
  status: string;
  sent_by_name?: string;
  error_message?: string | null;
  created_at: string;
};

function formatAddrs(addrs?: string[]): string {
  return (addrs ?? []).join(", ");
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function statusLabel(status: string): string {
  switch (status) {
    case "sent":
      return "Sent";
    case "failed":
      return "Failed";
    case "pending":
      return "Pending";
    default:
      return status;
  }
}

export default function SentDocumentsPage() {
  const { page, setPage, q, setQ, sort, order, toggleSort, pageSize } = useListState("created_at", 25, {
    defaultOrder: "desc",
  });
  const [selectedId, setSelectedId] = createSignal<number | null>(null);

  const [list, { refetch }] = createResource(
    () => ({ page: page(), q: q() }),
    async ({ page: p, q: query }) => {
      const qs = new URLSearchParams({
        page: String(p),
        pageSize: String(pageSize),
      });
      if (query) qs.set("q", query);
      const res = await apiFetch<SentMessageRow[]>(`/api/v1/comms/sent-messages?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load sent messages.");
      return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
    },
  );

  return (
    <CommsLayout>
      <SpreadsheetGrid
        columns={[
          { key: "created_at", header: "Sent at", render: (r) => formatWhen(r.created_at) },
          { key: "doc_type", header: "Document" },
          { key: "doc_id", header: "Doc ID" },
          { key: "subject", header: "Subject", clickable: true },
          { key: "to_addrs", header: "To", sortable: false, render: (r) => formatAddrs(r.to_addrs) },
          { key: "status", header: "Status", sortable: false, render: (r) => statusLabel(r.status) },
          { key: "sent_by_name", header: "Sent by", render: (r) => r.sent_by_name ?? "" },
          {
            key: "error_message",
            header: "Error",
            sortable: false,
            render: (r) => r.error_message ?? "",
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
        nameKey="doc_type"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        page={page()}
        pageSize={pageSize}
        total={list()?.total ?? 0}
        onPageChange={setPage}
        search={q()}
        onSearchChange={setQ}
        searchPlaceholder="Search subject or recipient…"
        onRefresh={() => void refetch()}
        settingsHref="/app/comms/settings"
      />
    </CommsLayout>
  );
}
