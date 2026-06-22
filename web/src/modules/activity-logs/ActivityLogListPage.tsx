import { createEffect, createSignal, Show } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import { useListState } from "../../shared/useListState";
import { useActivityLogList } from "../../shared/useActivityLogList";

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function summarizeJson(value: Record<string, unknown> | null | undefined): string {
  if (!value || Object.keys(value).length === 0) return "—";
  const text = JSON.stringify(value);
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

export default function ActivityLogListPage() {
  const [params] = useSearchParams();
  const { page, setPage, sort, order, toggleSort, pageSize } = useListState("created_at", 25, {
    defaultOrder: "desc",
  });

  const [draftFilters, setDraftFilters] = createSignal({
    dateFrom: "",
    dateTo: "",
    actorUserId: "",
    actionCode: "",
    targetType: "",
    module: typeof params.module === "string" ? params.module : "",
  });
  const [submittedFilters, setSubmittedFilters] = createSignal({ ...draftFilters() });
  const [selectedId, setSelectedId] = createSignal<number | null>(null);

  createEffect(() => {
    const moduleParam = typeof params.module === "string" ? params.module : "";
    if (moduleParam && moduleParam !== draftFilters().module) {
      setDraftFilters((f) => ({ ...f, module: moduleParam }));
      setSubmittedFilters((f) => ({ ...f, module: moduleParam }));
    }
  });

  const list = useActivityLogList(() => {
    const f = submittedFilters();
    return {
      page: page(),
      pageSize,
      sort: sort(),
      order: order(),
      dateFrom: f.dateFrom || undefined,
      dateTo: f.dateTo || undefined,
      actorUserId: f.actorUserId || undefined,
      actionCode: f.actionCode || undefined,
      targetType: f.targetType || undefined,
      module: f.module || undefined,
    };
  });

  const search = () => {
    setSubmittedFilters({ ...draftFilters() });
    setPage(1);
  };

  const reset = () => {
    const moduleParam = typeof params.module === "string" ? params.module : "";
    const cleared = {
      dateFrom: "",
      dateTo: "",
      actorUserId: "",
      actionCode: "",
      targetType: "",
      module: moduleParam,
    };
    setDraftFilters(cleared);
    setSubmittedFilters(cleared);
    setPage(1);
  };

  const rows = () => list.data?.rows ?? [];

  return (
    <div class="flex min-h-0 flex-1 flex-col gap-4 p-5">
      <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <div class="mb-3 flex flex-wrap items-end gap-3">
          <Field label="Date from">
            <input
              type="date"
              class={inputClass}
              value={draftFilters().dateFrom}
              onInput={(e) => setDraftFilters((f) => ({ ...f, dateFrom: e.currentTarget.value }))}
            />
          </Field>
          <Field label="Date to">
            <input
              type="date"
              class={inputClass}
              value={draftFilters().dateTo}
              onInput={(e) => setDraftFilters((f) => ({ ...f, dateTo: e.currentTarget.value }))}
            />
          </Field>
          <Field label="Actor user ID">
            <input
              type="text"
              class={inputClass}
              placeholder="User id"
              value={draftFilters().actorUserId}
              onInput={(e) => setDraftFilters((f) => ({ ...f, actorUserId: e.currentTarget.value }))}
            />
          </Field>
          <Field label="Action code">
            <input
              type="text"
              class={inputClass}
              placeholder="e.g. inventory.partner.create"
              value={draftFilters().actionCode}
              onInput={(e) => setDraftFilters((f) => ({ ...f, actionCode: e.currentTarget.value }))}
            />
          </Field>
          <Field label="Target type">
            <input
              type="text"
              class={inputClass}
              placeholder="e.g. inv_partner"
              value={draftFilters().targetType}
              onInput={(e) => setDraftFilters((f) => ({ ...f, targetType: e.currentTarget.value }))}
            />
          </Field>
          <Field label="Module">
            <input
              type="text"
              class={inputClass}
              placeholder="Prefix e.g. inventory"
              value={draftFilters().module}
              onInput={(e) => setDraftFilters((f) => ({ ...f, module: e.currentTarget.value }))}
            />
          </Field>
          <div class="flex gap-2 pb-0.5">
            <button
              type="button"
              class="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90"
              onClick={search}
            >
              Search
            </button>
            <button
              type="button"
              class="rounded-lg border border-stroke px-4 py-2 text-sm font-medium text-text-secondary hover:bg-slate-50"
              onClick={reset}
            >
              Reset
            </button>
          </div>
        </div>
      </section>

      <Show when={list.error}>
        <p class="text-sm text-red-600">{(list.error as Error).message}</p>
      </Show>

      <SpreadsheetGrid
        columns={[
          {
            key: "created_at",
            header: "When",
            sortable: true,
            render: (row) => <span class="whitespace-nowrap">{formatTimestamp(row.created_at)}</span>,
          },
          {
            key: "actor_name",
            header: "Actor",
            sortable: true,
            render: (row) => <span>{row.actor_name ?? (row.actor_user_id ? `#${row.actor_user_id}` : "—")}</span>,
          },
          { key: "action_code", header: "Action", sortable: true },
          { key: "target_type", header: "Target type", sortable: true },
          {
            key: "target_id",
            header: "Target ID",
            render: (row) => <span>{row.target_id ?? "—"}</span>,
          },
          {
            key: "new_values",
            header: "Changes",
            render: (row) => <span class="font-mono text-xs text-text-secondary">{summarizeJson(row.new_values)}</span>,
          },
        ]}
        rows={rows()}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={() => {}}
        onNew={() => {}}
        codeKey="action_code"
        nameKey="action_code"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        page={page()}
        pageSize={pageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        onRefresh={() => void list.refetch()}
      />
    </div>
  );
}
