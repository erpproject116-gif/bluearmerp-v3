import { createSignal, For, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import {
  useSupportTickets,
  useInvalidateSupportTickets,
  type Ticket,
  type TicketStatus,
} from "../../shared/useSupportTickets";
import { useListState } from "../../shared/useListState";
import { canManageAllSupportTickets, hasPermission, useAuth } from "../../shared/auth-context";
import { SupportLayout } from "./SupportLayout";
import { NewSupportTicketModal } from "./NewSupportTicketModal";
import { TicketListExportButtons } from "./TicketListExportButtons";
import { apiFetch } from "../../shared/api";
import { useToast } from "../../shared/toast";

const STATUS_OPTIONS: TicketStatus[] = ["open", "in_progress", "waiting", "resolved", "closed"];

function ticketsExportUrl(params: Record<string, string | undefined>, format: "csv") {
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
  const toast = useToast();
  const invalidateTickets = useInvalidateSupportTickets();
  const canCreate = () => hasPermission(auth.me, "support.tickets_new", "write");
  const canBulkStatus = () => canManageAllSupportTickets(auth.me);
  const scopedToMine = () => !canManageAllSupportTickets(auth.me);
  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } =
    useListState("ticket_date", 25, { defaultStatus: "", defaultOrder: "desc" });
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [selectedIds, setSelectedIds] = createSignal<Set<number>>(new Set());
  const [bulkStatus, setBulkStatus] = createSignal("");
  const [bulkSubmitting, setBulkSubmitting] = createSignal(false);
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

  const applyBulkStatus = async () => {
    const status = bulkStatus();
    const ids = [...selectedIds()];
    if (!status || ids.length === 0) return;
    setBulkSubmitting(true);
    const res = await apiFetch<{ updated: number; skipped: number }>(
      "/api/v1/support/tickets/bulk-status",
      { method: "POST", body: JSON.stringify({ ids, status }) },
      { silent: true },
    );
    setBulkSubmitting(false);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? "Bulk status update failed.");
      return;
    }
    toast.success(`Updated ${res.data.updated} ticket(s).`);
    setSelectedIds(new Set<number>());
    setBulkStatus("");
    invalidateTickets();
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
        <Show when={canBulkStatus()}>
          <label class="text-sm text-text-secondary">
            Set status
            <select
              class="ml-2 rounded border border-stroke px-2 py-1 text-sm"
              value={bulkStatus()}
              disabled={selectedIds().size === 0 || bulkSubmitting()}
              onChange={(e) => setBulkStatus(e.currentTarget.value)}
            >
              <option value="">Select…</option>
              <For each={STATUS_OPTIONS}>{(s) => <option value={s}>{s.replace("_", " ")}</option>}</For>
            </select>
          </label>
          <button
            type="button"
            class="rounded-lg border border-stroke px-3 py-1.5 text-sm disabled:opacity-40"
            disabled={!bulkStatus() || selectedIds().size === 0 || bulkSubmitting()}
            onClick={() => void applyBulkStatus()}
          >
            Apply{selectedIds().size > 0 ? ` (${selectedIds().size})` : ""}
          </button>
        </Show>
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
        selectable={canBulkStatus()}
        selectedIds={selectedIds()}
        onSelectionChange={(ids) => setSelectedIds(new Set(ids))}
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
          <TicketListExportButtons
            rows={() => list.data?.rows ?? []}
            exportUrl={(format) => ticketsExportUrl(exportFilter(), format)}
          />
        }
      />

      <NewSupportTicketModal open={modalOpen()} onClose={() => setModalOpen(false)} />
    </SupportLayout>
  );
}
