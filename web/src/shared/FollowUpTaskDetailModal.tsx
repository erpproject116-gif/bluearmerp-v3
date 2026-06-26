import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { DateInput } from "./DateInput";
import { EntityModal, Field, inputClass } from "./SpreadsheetGrid";
import { entityRecordHref } from "./entityRoutes";
import { TASK_BOARD_STAGES, taskStageBadgeClass, taskStageLabel } from "./crmTaskStages";
import { useInvalidateCrmTaskSummaries } from "./useCrmTaskSummaries";
import {
  fetchFollowUpTask,
  patchFollowUpTask,
  patchFollowUpTaskStage,
  useInvalidateFollowUpTasks,
  type FollowUpTask,
  type FollowUpTaskStage,
} from "./useFollowUpTasks";
import { useToast } from "./toast";

type Props = {
  taskId: () => number | null;
  open: () => boolean;
  onClose: () => void;
};

function linkedRecord(task: FollowUpTask): { label: string; href: string } | null {
  if (task.quotation_id) {
    const href = entityRecordHref("quo_quotation", task.quotation_id);
    return href
      ? { label: task.quotation_reference ? `Quotation ${task.quotation_reference}` : `Quotation #${task.quotation_id}`, href }
      : null;
  }
  if (task.sales_id) {
    const href = entityRecordHref("sa_sales", task.sales_id);
    return href
      ? { label: task.sales_no ? `Sale ${task.sales_no}` : `Sale #${task.sales_id}`, href }
      : null;
  }
  if (task.warranty_asset_id) {
    const href = entityRecordHref("crm_warranty_asset", task.warranty_asset_id);
    return href
      ? { label: task.warranty_serial ? `Warranty ${task.warranty_serial}` : `Warranty #${task.warranty_asset_id}`, href }
      : null;
  }
  return null;
}

export function FollowUpTaskDetailModal(props: Props) {
  const toast = useToast();
  const invalidateTasks = useInvalidateFollowUpTasks();
  const invalidateSummaries = useInvalidateCrmTaskSummaries();
  const [saving, setSaving] = createSignal(false);
  const [title, setTitle] = createSignal("");
  const [dueDate, setDueDate] = createSignal("");
  const [notes, setNotes] = createSignal("");
  const [stage, setStage] = createSignal<FollowUpTaskStage>("scheduled");

  const loadId = () => {
    if (!props.open()) return undefined;
    const id = props.taskId();
    if (id == null || !Number.isFinite(id) || id <= 0) return undefined;
    return id;
  };

  const [task, { refetch }] = createResource(loadId, async (id) => {
    const res = await fetchFollowUpTask(id);
    if (!res.success || !res.data) {
      throw new Error(res.message ?? "Could not load task.");
    }
    return res.data;
  });

  createEffect(() => {
    const t = task();
    if (!t) return;
    setTitle(t.title);
    setDueDate(t.due_date);
    setNotes(t.notes ?? "");
    setStage(t.stage);
  });

  createEffect(() => {
    if (!props.open()) return;
    const err = task.error;
    if (!err) return;
    toast.warning(err instanceof Error ? err.message : "Could not load task.");
    props.onClose();
  });

  const save = async () => {
    const t = task();
    if (!t) return;
    if (!title().trim()) {
      toast.warning("Title is required.");
      return;
    }
    setSaving(true);
    try {
      const res = await patchFollowUpTask(t.id, {
        task_type: t.task_type,
        stage: stage(),
        due_date: dueDate(),
        partner_id: t.partner_id,
        pic_user_id: t.pic_user_id,
        pic_name: t.pic_name,
        warranty_asset_id: t.warranty_asset_id,
        quotation_id: t.quotation_id,
        sales_id: t.sales_id,
        title: title().trim(),
        notes: notes().trim() || null,
      });
      if (!res.success) {
        toast.warning(res.message ?? "Could not save task.");
        return;
      }
      toast.success("Task updated.");
      invalidateTasks();
      invalidateSummaries();
      props.onClose();
    } finally {
      setSaving(false);
    }
  };

  const setStageOnly = async (next: FollowUpTaskStage) => {
    const t = task();
    if (!t) return;
    const res = await patchFollowUpTaskStage(t.id, next);
    if (!res.success) {
      toast.warning(res.message ?? "Could not update stage.");
      return;
    }
    setStage(next);
    invalidateTasks();
    invalidateSummaries();
    void refetch();
  };

  const loading = () => props.open() && loadId() != null && task.loading;
  const loadedTask = () => task();
  const loadFailed = () =>
    props.open() && loadId() != null && !task.loading && task.error != null && !loadedTask();

  return (
    <EntityModal
      open={props.open()}
      title="CRM follow-up task"
      onClose={props.onClose}
      onSave={() => void save()}
      saving={saving()}
      wide
      singleColumn
    >
      <Show when={loading()}>
        <p class="text-sm text-text-secondary">Loading…</p>
      </Show>
      <Show when={loadFailed()}>
        <p class="text-sm text-text-secondary">Task details could not be loaded.</p>
      </Show>
      <Show when={!loading() && loadedTask()}>
        {(t) => {
          const current = () => t() as FollowUpTask;
          const link = () => linkedRecord(current());
          return (
            <>
              <div class="mb-3 flex flex-wrap items-center gap-2">
                <span class={`rounded-full px-2 py-0.5 text-xs font-medium ${taskStageBadgeClass(stage())}`}>
                  {taskStageLabel(stage())}
                </span>
                <Show when={current().partner_name}>
                  <span class="text-sm text-text-secondary">Customer: {current().partner_name}</span>
                </Show>
                <Show when={current().pic_name}>
                  <span class="text-sm text-text-secondary">PIC: {current().pic_name}</span>
                </Show>
              </div>
              <Show when={link()}>
                {(l) => (
                  <p class="mb-3 text-sm">
                    Linked record:{" "}
                    <A href={l().href} class="font-medium text-brand-600 hover:underline" onClick={props.onClose}>
                      {l().label}
                    </A>
                  </p>
                )}
              </Show>
              <Field label="Title">
                <input class={inputClass} value={title()} onInput={(e) => setTitle(e.currentTarget.value)} />
              </Field>
              <Field label="Due date">
                <DateInput value={dueDate()} onInput={(e) => setDueDate(e.currentTarget.value)} />
              </Field>
              <Field label="Stage">
                <select
                  class={inputClass}
                  value={stage()}
                  onChange={(e) => void setStageOnly(e.currentTarget.value as FollowUpTaskStage)}
                >
                  <For each={TASK_BOARD_STAGES}>
                    {(s) => <option value={s.id}>{s.label}</option>}
                  </For>
                  <option value="cancelled">Cancelled</option>
                </select>
              </Field>
              <Field label="Notes">
                <textarea
                  class={`${inputClass} min-h-[6rem]`}
                  value={notes()}
                  onInput={(e) => setNotes(e.currentTarget.value)}
                />
              </Field>
            </>
          );
        }}
      </Show>
    </EntityModal>
  );
}
