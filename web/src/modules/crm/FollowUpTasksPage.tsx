import { createMemo, createSignal, Show } from "solid-js";
import { KanbanBoard } from "../../shared/KanbanBoard";
import { KanbanCard } from "../../shared/KanbanCard";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import { loadViewMode, ViewModeToggle, type ViewMode } from "../../shared/ViewModeToggle";
import {
  createFollowUpTask,
  patchFollowUpTaskStage,
  useFollowUpTasks,
  useInvalidateFollowUpTasks,
  type FollowUpTask,
  type FollowUpTaskStage,
} from "../../shared/useFollowUpTasks";
import { useListState } from "../../shared/useListState";
import { useToast } from "../../shared/toast";
import { CrmLayout } from "./CrmLayout";

const BOARD_STAGES: { id: FollowUpTaskStage; label: string }[] = [
  { id: "scheduled", label: "Scheduled" },
  { id: "due_soon", label: "Due soon" },
  { id: "overdue", label: "Overdue" },
  { id: "completed", label: "Completed" },
];

const STORAGE_KEY = "crm-follow-up-view";

export default function FollowUpTasksPage() {
  const [viewMode, setViewMode] = createSignal<ViewMode>(loadViewMode(STORAGE_KEY));
  const { page, setPage, q, setQ, sort, order, toggleSort, pageSize } = useListState("due_date");
  const [modalOpen, setModalOpen] = createSignal(false);
  const [newTitle, setNewTitle] = createSignal("");
  const [newDueDate, setNewDueDate] = createSignal(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = createSignal(false);
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const toast = useToast();
  const invalidate = useInvalidateFollowUpTasks();

  const list = useFollowUpTasks(() => ({
    page: viewMode() === "board" ? 1 : page(),
    pageSize: viewMode() === "board" ? 500 : pageSize,
    q: q() || undefined,
    board: viewMode() === "board",
  }));

  const boardColumns = createMemo(() =>
    BOARD_STAGES.map((s) => ({
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

  const saveNew = async () => {
    if (!newTitle().trim()) {
      toast.warning("Title is required.");
      return;
    }
    setSaving(true);
    const res = await createFollowUpTask({
      title: newTitle().trim(),
      due_date: newDueDate(),
      task_type: "manual",
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not create task.");
      return;
    }
    toast.success("Task created.");
    setModalOpen(false);
    setNewTitle("");
    invalidate();
  };

  return (
    <CrmLayout>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <ViewModeToggle value={viewMode()} onChange={setViewMode} storageKey={STORAGE_KEY} />
        <button
          type="button"
          class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          onClick={() => setModalOpen(true)}
        >
          + New task
        </button>
      </div>

      <Show when={viewMode() === "table"}>
        <SpreadsheetGrid
          columns={[
            { key: "title", header: "Title", clickable: true },
            { key: "task_type", header: "Type" },
            { key: "stage", header: "Stage" },
            { key: "due_date", header: "Due date" },
            { key: "partner_name", header: "Customer", render: (r) => r.partner_name ?? "—" },
            { key: "pic_name", header: "PIC" },
          ]}
          rows={list.data?.rows ?? []}
          loading={list.isFetching}
          selectedId={selectedId()}
          onSelect={setSelectedId}
          onEdit={() => {}}
          onNew={() => setModalOpen(true)}
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
              subtitle={t.partner_name ?? undefined}
              meta={`Due ${t.due_date}${t.pic_name ? ` · ${t.pic_name}` : ""}`}
              severity={t.stage === "overdue" ? "critical" : t.stage === "due_soon" ? "warning" : "info"}
            />
          )}
        />
      </Show>

      <EntityModal
        open={modalOpen()}
        title="New follow-up task"
        onClose={() => setModalOpen(false)}
        onSave={() => void saveNew()}
        saving={saving()}
      >
        <Field label="Title">
          <input class={inputClass} value={newTitle()} onInput={(e) => setNewTitle(e.currentTarget.value)} />
        </Field>
        <Field label="Due date">
          <input
            type="date"
            class={inputClass}
            value={newDueDate()}
            onInput={(e) => setNewDueDate(e.currentTarget.value)}
          />
        </Field>
      </EntityModal>
    </CrmLayout>
  );
}
