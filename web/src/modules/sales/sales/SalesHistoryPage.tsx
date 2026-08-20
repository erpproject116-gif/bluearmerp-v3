import { A, useNavigate } from "@solidjs/router";
import { Show, createSignal } from "solid-js";
import { SpreadsheetGrid } from "../../../shared/SpreadsheetGrid";
import { canViewActivityLogs, useAuth } from "../../../shared/auth-context";
import { useActivityLogList, type ActivityLogRow } from "../../../shared/useActivityLogList";
import { useListState } from "../../../shared/useListState";
import { useSalesList, type SalesRow } from "../../../shared/useSalesList";
import { SalesLayout } from "../SalesLayout";
import { formatMoney } from "./salesPrint";

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function whatHappened(row: ActivityLogRow): string {
  return row.summary?.trim() || row.action_code.replace(/[._]/g, " ");
}

/** Sales invoice activity (creates, edits, confirms) for the History tab. */
export default function SalesHistoryPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const canLogs = () => canViewActivityLogs(auth.me);
  const { page, setPage, sort, order, toggleSort, pageSize, q, setQ } = useListState("created_at", 25, {
    defaultOrder: "desc",
  });
  const [selectedId, setSelectedId] = createSignal<number | null>(null);

  const logs = useActivityLogList(() => ({
    page: page(),
    pageSize,
    sort: sort() === "order_date" ? "created_at" : sort(),
    order: order(),
    targetType: "sa_sales",
    referenceNo: q() || undefined,
    enabled: Boolean(auth.me) && canLogs(),
  }));

  const invoices = useSalesList(() => ({
    page: page(),
    pageSize,
    sort: sort() === "created_at" ? "order_date" : sort(),
    order: order(),
    q: q() || undefined,
  }));

  const openSale = (id: number) => {
    navigate(`/app/sales/sales?openId=${id}`);
  };

  return (
    <SalesLayout>
      <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold text-text-primary">Sales history</h2>
          <p class="mt-1 text-sm text-text-secondary">
            {canLogs()
              ? "Creates, edits, confirms, and other changes to sales invoices in this workspace."
              : "Past sales invoices, newest first. Ask an admin for Activity Logs access to see who changed each document."}
          </p>
        </div>
        <Show when={canLogs()}>
          <A href="/app/activity-logs?target_type=sa_sales" class="text-sm font-medium text-brand-600 hover:underline">
            Full activity log
          </A>
        </Show>
      </div>

      <Show when={canLogs()}>
        <Show when={logs.error}>
          <p class="mb-3 text-sm text-red-600">{(logs.error as Error).message}</p>
        </Show>
        <SpreadsheetGrid<ActivityLogRow>
          columns={[
            {
              key: "created_at",
              header: "When",
              sortable: true,
              render: (row) => <span class="whitespace-nowrap">{formatWhen(row.created_at)}</span>,
            },
            {
              key: "summary",
              header: "What happened",
              render: (row) => <span>{whatHappened(row)}</span>,
            },
            {
              key: "reference_no",
              header: "Sales No.",
              clickable: true,
              render: (row) => {
                const label = row.reference_no || row.reference_label || (row.target_id ? `#${row.target_id}` : "—");
                if (row.target_id == null) return <span>{label}</span>;
                return (
                  <A href={`/app/sales/sales?openId=${row.target_id}`} class="font-medium text-brand-600 hover:underline">
                    {label}
                  </A>
                );
              },
            },
            {
              key: "actor_name",
              header: "Who",
              render: (row) => <span>{row.actor_name ?? "—"}</span>,
            },
          ]}
          rows={logs.data?.rows ?? []}
          loading={logs.isFetching}
          selectedId={selectedId()}
          onSelect={setSelectedId}
          onEdit={(row) => {
            if (row.target_id != null) openSale(row.target_id);
          }}
          onNew={() => {}}
          showNew={false}
          codeKey="reference_no"
          nameKey="summary"
          sortKey={sort()}
          sortOrder={order()}
          onSort={toggleSort}
          page={page()}
          pageSize={pageSize}
          total={logs.data?.total ?? 0}
          onPageChange={setPage}
          search={q()}
          onSearchChange={setQ}
          searchPlaceholder="Search sales no.…"
          onRefresh={() => void logs.refetch()}
        />
      </Show>

      <Show when={!canLogs()}>
        <SpreadsheetGrid<SalesRow>
          columns={[
            { key: "order_date", header: "Date", sortable: true },
            { key: "sales_no", header: "Sales No.", clickable: true },
            { key: "customer_name", header: "Customer" },
            {
              key: "grand_total",
              header: "Amount",
              render: (r) => formatMoney(r.grand_total, r.currency_code),
            },
            { key: "progress_status", header: "Status" },
            { key: "created_by_name", header: "Who", render: (r) => r.created_by_name ?? "—" },
          ]}
          rows={invoices.data?.rows ?? []}
          loading={invoices.isFetching}
          selectedId={selectedId()}
          onSelect={setSelectedId}
          onEdit={(row) => openSale(row.id)}
          onNew={() => {}}
          showNew={false}
          codeKey="sales_no"
          nameKey="customer_name"
          sortKey={sort() === "created_at" ? "order_date" : sort()}
          sortOrder={order()}
          onSort={toggleSort}
          page={page()}
          pageSize={pageSize}
          total={invoices.data?.total ?? 0}
          onPageChange={setPage}
          search={q()}
          onSearchChange={setQ}
          searchPlaceholder="Search sales…"
          onRefresh={() => void invoices.refetch()}
        />
      </Show>
    </SalesLayout>
  );
}
