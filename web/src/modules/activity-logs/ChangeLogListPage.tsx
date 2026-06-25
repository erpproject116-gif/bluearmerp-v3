import { createEffect, createSignal, For, Show } from "solid-js";
import { A, useSearchParams } from "@solidjs/router";
import { SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { entityRecordHref } from "../../shared/entityRoutes";
import { useListState } from "../../shared/useListState";
import { useChangeLogList } from "../../shared/useChangeLogList";
import { ActivityLogFilterPanel, ActivityLogLayout } from "./ActivityLogLayout";

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function ChangeLogListPage() {
  const [params] = useSearchParams();
  const { page, setPage, sort, order, toggleSort, pageSize } = useListState("created_at", 25, {
    defaultOrder: "desc",
  });

  const [draftFilters, setDraftFilters] = createSignal({
    dateFrom: "",
    dateTo: "",
    actorUserId: "",
    actionCode: "",
    targetType: typeof params.target_type === "string" ? params.target_type : "",
    targetId: typeof params.target_id === "string" ? params.target_id : "",
    module: typeof params.module === "string" ? params.module : "",
    referenceNo: typeof params.reference_no === "string" ? params.reference_no : "",
  });
  const [submittedFilters, setSubmittedFilters] = createSignal({ ...draftFilters() });
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [expandedId, setExpandedId] = createSignal<number | null>(null);

  createEffect(() => {
    const moduleParam = typeof params.module === "string" ? params.module : "";
    const targetTypeParam = typeof params.target_type === "string" ? params.target_type : "";
    const targetIdParam = typeof params.target_id === "string" ? params.target_id : "";
    const refParam = typeof params.reference_no === "string" ? params.reference_no : "";
    if (
      moduleParam !== draftFilters().module ||
      targetTypeParam !== draftFilters().targetType ||
      targetIdParam !== draftFilters().targetId ||
      refParam !== draftFilters().referenceNo
    ) {
      const next = {
        ...draftFilters(),
        module: moduleParam,
        targetType: targetTypeParam,
        targetId: targetIdParam,
        referenceNo: refParam,
      };
      setDraftFilters(next);
      setSubmittedFilters(next);
    }
  });

  const list = useChangeLogList(() => {
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
      targetId: f.targetId || undefined,
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
      targetType: typeof params.target_type === "string" ? params.target_type : "",
      targetId: typeof params.target_id === "string" ? params.target_id : "",
      module: moduleParam,
      referenceNo: typeof params.reference_no === "string" ? params.reference_no : "",
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
              header: "Changed by",
              sortable: true,
              render: (row) => (
                <span class="font-medium">{row.actor_name ?? (row.actor_user_id ? `User #${row.actor_user_id}` : "—")}</span>
              ),
            },
            {
              key: "entity_label",
              header: "Record",
              render: (row) => <span>{row.entity_label}</span>,
            },
            {
              key: "reference_no",
              header: "Reference",
              render: (row) => {
                const href =
                  row.target_type && row.target_id
                    ? entityRecordHref(row.target_type, row.target_id)
                    : null;
                return (
                  <span class="whitespace-nowrap">
                    {row.reference_no ? (
                      <>
                        <span class="text-text-secondary">{row.reference_label} </span>
                        {href ? (
                          <A href={href} class="font-medium text-brand-600 hover:underline">
                            {row.reference_no}
                          </A>
                        ) : (
                          <span class="font-medium">{row.reference_no}</span>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </span>
                );
              },
            },
            {
              key: "summary",
              header: "Change description",
              render: (row) => (
                <div class="max-w-xl">
                  <p class="text-sm leading-snug text-text-primary">{row.summary}</p>
                  <Show when={(row.details?.length ?? 0) > 1}>
                    <button
                      type="button"
                      class="mt-1 text-xs text-brand-600 hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedId((id) => (id === row.id ? null : row.id));
                      }}
                    >
                      {expandedId() === row.id ? "Hide details" : `+${(row.details?.length ?? 0) - 1} more change(s)`}
                    </button>
                    <Show when={expandedId() === row.id}>
                      <ul class="mt-2 list-disc space-y-1 pl-4 text-xs text-text-secondary">
                        <For each={row.details?.slice(1) ?? []}>{(line) => <li>{line}</li>}</For>
                      </ul>
                    </Show>
                  </Show>
                </div>
              ),
            },
          ]}
          rows={list.data?.rows ?? []}
          loading={list.isFetching}
          selectedId={selectedId()}
          onSelect={setSelectedId}
          onEdit={() => {}}
          onNew={() => {}}
          codeKey="reference_no"
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
      </div>
    </ActivityLogLayout>
  );
}
