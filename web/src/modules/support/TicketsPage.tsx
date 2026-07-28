import { createSignal, For, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import {
  useSupportTickets,
  type Ticket,
  type TicketStatus,
} from "../../shared/useSupportTickets";
import { useListState } from "../../shared/useListState";
import { canManageAllSupportTickets, hasPermission, useAuth } from "../../shared/auth-context";
import { downloadReportCsv } from "../../shared/reports/downloadReportCsv";
import { SupportLayout } from "./SupportLayout";
import { NewSupportTicketModal } from "./NewSupportTicketModal";

const STATUS_OPTIONS: TicketStatus[] = ["open", "in_progress", "waiting", "resolved", "closed"];

function ticketsExportUrl(params: Record<string, string | undefined>, format: "csv" | "md") {
  const qs = new URLSearchParams();
  qs.set("format", format);
  for (const [k, v] of Object.entries(params)) {
    if (v) qs.set(k, v);
  }
  return `/api/v1/support/tickets/export?${qs}`;
}

export default function TicketsPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const canCreate = () => hasPermission(auth.me, "support.tickets_new", "write");
  const scopedToMine = () => !canManageAllSupportTickets(auth.me);
  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } =
    useListState("ticket_date", 25, { defaultStatus: "", defaultOrder: "desc" });
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);

  const list = useSupportTickets(() => ({
    page: page(),
    pageSize,
    q: q() || undefined,
    status: statusFilter() || undefined,
    sort: sort(),
    order: order(),
  }));

  const openNew = () => setModalOpen(true);

  const openDetail = (row: Ticket) => {
    navigate(`/app/support/tickets/${row.id}`);
  };

  const exportFilter = () => ({
    q: q() || undefined,
    status: statusFilter() || undefined,
  });

  const exportCsv = () => {
    void downloadReportCsv(ticketsExportUrl(exportFilter(), "csv"), "support-tickets.csv");
  };

  const exportMarkdown = () => {
    void downloadReportCsv(ticketsExportUrl(exportFilter(), "md"), "support-tickets.md");
  };

  return (
    <SupportLayout>
      <Show when={scopedToMine()}>
        <p class="mb-3 text-sm text-text-secondary">Showing tickets you opened.</p>
      </Show>
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <label class="text-sm text-text-secondary">
          Status
          <select
            class="ml-2 rounded border border-stroke px-2 py-1 text-sm"
            value={statusFilter()}
            onChange={(e) => setStatusFilter(e.currentTarget.value)}
          >
            <option value="">All</option>
            <For each={STATUS_OPTIONS}>{(s) => <option value={s}>{s.replace("_", " ")}</option>}</For>
          </select>
        </label>
      </div>

      <SpreadsheetGrid
        columns={[
          { key: "ticket_no", header: "Ticket #", clickable: true },
          { key: "ticket_date", header: "Date" },
          { key: "subject", header: "Subject" },
          { key: "partner_name", header: "Customer" },
          { key: "category", header: "Category" },
          { key: "priority", header: "Priority" },
          { key: "status", header: "Status" },
          { key: "assigned_name", header: "Assigned" },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={openDetail}
        onNew={openNew}
        showNew={canCreate()}
        codeKey="ticket_no"
        nameKey="subject"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        page={page()}
        pageSize={pageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        search={q()}
        onSearchChange={setQ}
        searchPlaceholder="Search tickets…"
        hideExport
        toolbarExtra={
          <>
            <button
              type="button"
              class="rounded-lg border border-stroke px-3 py-2 text-sm font-medium text-text-secondary hover:erp-panel"
              onClick={exportCsv}
              title="Download all matching tickets with full description and comments (CSV)"
            >
              Export CSV
            </button>
            <button
              type="button"
              class="rounded-lg border border-stroke px-3 py-2 text-sm font-medium text-text-secondary hover:erp-panel"
              onClick={exportMarkdown}
              title="Download all matching tickets with full description and comments (Markdown docs)"
            >
              Export docs (MD)
            </button>
          </>
        }
      />

      <NewSupportTicketModal open={modalOpen()} onClose={() => setModalOpen(false)} />
    </SupportLayout>
  );
}
