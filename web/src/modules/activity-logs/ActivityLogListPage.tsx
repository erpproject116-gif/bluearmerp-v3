import { createEffect, createSignal, For, Show } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { useListState } from "../../shared/useListState";
import { useActivityLogList } from "../../shared/useActivityLogList";
import { ActivityLogFilterPanel, ActivityLogLayout } from "./ActivityLogLayout";

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
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
    referenceNo: "",
  });
  const [submittedFilters, setSubmittedFilters] = createSignal({ ...draftFilters() });
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [expandedId, setExpandedId] = createSignal<number | null>(null);

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
      referenceNo: f.referenceNo || undefined,
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
      referenceNo: "",
    };
    setDraftFilters(cleared);
    setSubmittedFilters(cleared);
    setPage(1);
  };

  return (
    <ActivityLogLayout>
      <div class="flex min-h-0 flex-1 flex-col gap-4 p-5">
        <ActivityLogFilterPanel
          draftFilters={draftFilters}
          setDraftFilters={setDraftFilters}
          onSearch={search}
          onReset={reset}
          showReferenceNo
        />

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
            {
              key: "summary",
              header: "What happened",
              render: (row) => (
                <button
                  type="button"
                  class="text-left text-sm text-text-primary hover:text-brand-600"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedId((id) => (id === row.id ? null : row.id));
                  }}
                >
                  {row.summary || row.action_code}
                </button>
              ),
            },
            {
              key: "reference_no",
              header: "Reference",
              render: (row) => (
                <span class="text-sm text-text-secondary">
                  {row.reference_no ? `${row.reference_label ?? ""} ${row.reference_no}`.trim() : "—"}
                </span>
              ),
            },
          ]}
          rows={list.data?.rows ?? []}
          loading={list.isFetching}
          selectedId={selectedId()}
          onSelect={setSelectedId}
          onEdit={() => {}}
          onNew={() => {}}
          codeKey="action_code"
          nameKey="summary"
          sortKey={sort()}
          sortOrder={order()}
          onSort={toggleSort}
          page={page()}
          pageSize={pageSize}
          total={list.data?.total ?? 0}
          onPageChange={setPage}
          onRefresh={() => void list.refetch()}
        />

        <Show when={expandedId()}>
          {(id) => {
            const row = () => list.data?.rows.find((r) => r.id === id());
            return (
              <Show when={row()}>
                {(r) => (
                  <section class="rounded-xl border border-stroke bg-white p-4 text-sm shadow-sm">
                    <p class="font-medium text-text-primary">{r().summary}</p>
                    <Show when={(r().details?.length ?? 0) > 0}>
                      <ul class="mt-2 list-disc space-y-1 pl-5 text-text-secondary">
                        <For each={r().details ?? []}>{(d) => <li>{d}</li>}</For>
                      </ul>
                    </Show>
                  </section>
                )}
              </Show>
            );
          }}
        </Show>
      </div>
    </ActivityLogLayout>
  );
}
