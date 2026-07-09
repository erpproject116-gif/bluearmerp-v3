import { createEffect, createMemo, createSignal, Show } from "solid-js";
import { A, useSearchParams } from "@solidjs/router";
import { KanbanBoard } from "../../shared/KanbanBoard";
import { KanbanCard, type KanbanDetailRow } from "../../shared/KanbanCard";
import { useCrmTaskModal } from "../../shared/CrmTaskModal";
import {
  TASK_BOARD_STAGES,
  taskKanbanSeverity,
  taskStageLabel,
} from "../../shared/crmTaskStages";
import { SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { loadViewMode, ViewModeToggle, type ViewMode } from "../../shared/ViewModeToggle";
import {
  patchFollowUpTaskStage,
  useFollowUpTasks,
  useInvalidateFollowUpTasks,
  type FollowUpTask,
  type FollowUpTaskStage,
  type FollowUpTaskType,
} from "../../shared/useFollowUpTasks";
import { useListState } from "../../shared/useListState";
import { useToast } from "../../shared/toast";
import { CrmLayout } from "./CrmLayout";

const STORAGE_KEY = "crm-follow-up-view";

const TASK_TYPE_LABELS: Record<FollowUpTaskType, string> = {
  warranty_follow_up: "Warranty follow-up",
  quote_follow_up: "Quote follow-up",
  manual: "Manual task",
};

function truncate(text: string, max: number) {
  const s = text.trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function taskCardDetails(task: FollowUpTask): KanbanDetailRow[] {
  const rows: KanbanDetailRow[] = [{ label: "Due", value: task.due_date }];
  if (task.partner_name) rows.push({ label: "Customer", value: task.partner_name });
  if (task.pic_name) rows.push({ label: "PIC", value: task.pic_name });
  if (task.quotation_reference) rows.push({ label: "Quote", value: task.quotation_reference });
  if (task.sales_no) rows.push({ label: "Sale", value: task.sales_no });
  if (task.warranty_serial) rows.push({ label: "Serial", value: task.warranty_serial });
  if (task.notes?.trim()) rows.push({ label: "Notes", value: truncate(task.notes, 140) });
  if (task.completed_at) rows.push({ label: "Completed", value: task.completed_at.slice(0, 10) });
  return rows;
}

export default function FollowUpTasksPage() {
  const [searchParams] = useSearchParams();
  const [viewMode, setViewMode] = createSignal<ViewMode>(loadViewMode(STORAGE_KEY));
  const { page, setPage, q, setQ, sort, order, toggleSort, pageSize } = useListState("due_date");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const toast = useToast();
  const invalidate = useInvalidateFollowUpTasks();
  const crmTask = useCrmTaskModal();

  const taskFromUrl = createMemo(() => {
    const raw = searchParams.task;
    const id = typeof raw === "string" ? Number(raw) : NaN;
    return Number.isFinite(id) && id > 0 ? id : null;
  });

  const openTask = (task: FollowUpTask) => {
    setSelectedId(task.id);
    crmTask.openTask(task.id);
  };

  const [urlTaskOpened, setUrlTaskOpened] = createSignal<number | null>(null);
  createEffect(() => {
    const id = taskFromUrl();
    if (!id) {
      setUrlTaskOpened(null);
      return;
    }
    if (urlTaskOpened() === id) return;
    setUrlTaskOpened(id);
    crmTask.openTask(id);
  });

  const list = useFollowUpTasks(() => ({
    page: viewMode() === "board" ? 1 : page(),
    pageSize: viewMode() === "board" ? 500 : pageSize,
    q: q() || undefined,
    board: viewMode() === "board",
  }));

  const boardColumns = createMemo(() =>
    TASK_BOARD_STAGES.map((s) => ({
      id: s.id,
      label: s.label,
      items: (list.data?.rows ?? []).filter((t) => t.stage === s.id),
    })),
  );

  const onDrop = async (item: FollowUpTask, _from: string, toColumnId: string) => {
    const res = await patchFollowUpTaskStage(item.id, toColumnId as FollowUpTaskStage);
    if (!res.success) {
      toast.warning(res.message ?? "Could not update stage.");
      return;
    }
    invalidate();
  };

  return (
    <CrmLayout>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <ViewModeToggle value={viewMode()} onChange={setViewMode} storageKey={STORAGE_KEY} />
        <div class="flex flex-wrap items-center gap-2">
          <A
            href="/app/operations?ws=crm-follow-up"
            class="rounded-lg border border-stroke px-4 py-2 text-sm font-medium text-brand-600 hover:bg-slate-50"
          >
            View in Operations Hub
          </A>
          <button
          type="button"
          class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          onClick={() => crmTask.openCreate()}
        >
          + New task
        </button>
        </div>
      </div>

      <Show when={viewMode() === "table"}>
        <SpreadsheetGrid
          columns={[
            { key: "title", header: "Title", clickable: true },
            { key: "task_type", header: "Type", render: (r) => TASK_TYPE_LABELS[r.task_type] },
            {
              key: "stage",
              header: "Stage",
              render: (r) => taskStageLabel(r.stage),
            },
            { key: "due_date", header: "Due date" },
            { key: "partner_name", header: "Customer", render: (r) => r.partner_name ?? "—" },
            {
              key: "notes",
              header: "Notes",
              render: (r) => (r.notes?.trim() ? truncate(r.notes, 80) : "—"),
            },
            { key: "pic_name", header: "PIC" },
          ]}
          rows={list.data?.rows ?? []}
          loading={list.isFetching}
          selectedId={selectedId()}
          onSelect={setSelectedId}
          onEdit={(row) => openTask(row)}
          onNew={() => crmTask.openCreate()}
          codeKey="title"
          nameKey="title"
          sortKey={sort()}
          sortOrder={order()}
          onSort={toggleSort}
          page={page()}
          pageSize={pageSize}
          total={list.data?.total ?? 0}
          onPageChange={setPage}
          search={q()}
          onSearchChange={setQ}
          searchPlaceholder="Search tasks…"
        />
      </Show>

      <Show when={viewMode() === "board"}>
        <KanbanBoard
          columns={boardColumns()}
          getCardId={(t) => t.id}
          onDrop={(item, from, to) => void onDrop(item, from, to)}
          loading={list.isFetching}
          renderCard={(t) => (
            <KanbanCard
              title={t.title}
              subtitle={TASK_TYPE_LABELS[t.task_type]}
              badge={taskStageLabel(t.stage)}
              details={taskCardDetails(t)}
              severity={taskKanbanSeverity(t.stage)}
              onClick={() => openTask(t)}
            />
          )}
        />
      </Show>
    </CrmLayout>
  );
}
