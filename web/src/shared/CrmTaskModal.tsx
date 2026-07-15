import { createContext, createSignal, Show, useContext, type ParentProps } from "solid-js";
import { DateInput } from "./DateInput";
import { FollowUpTaskDetailModal } from "./FollowUpTaskDetailModal";
import { EntityModal, Field, inputClass } from "./SpreadsheetGrid";
import {
  createFollowUpTask,
  useInvalidateFollowUpTasks,
  type FollowUpTask,
  type FollowUpTaskType,
} from "./useFollowUpTasks";
import { useInvalidateCrmTaskSummaries } from "./useCrmTaskSummaries";
import { useToast } from "./toast";
import { canManageSalesTeam, useAuth } from "./auth-context";
import { useSalesTeamMembers } from "./useSalesTeamMembers";
import { useDocumentDraft } from "./useDocumentDraft";
import { DRAFT_ENTITY } from "./entityTypes";

export type CrmTaskContext = {
  task_type?: FollowUpTaskType;
  title?: string;
  due_date?: string;
  partner_id?: number | null;
  partner_name?: string;
  pic_name?: string;
  notes?: string;
  quotation_id?: number | null;
  sales_id?: number | null;
  purchase_request_id?: number | null;
  warranty_asset_id?: number | null;
};

type CrmTaskModalAPI = {
  /** @deprecated use openCreate */
  open: (context?: CrmTaskContext) => void;
  openCreate: (context?: CrmTaskContext) => void;
  openTask: (taskId: number) => void;
};

const CrmTaskModalContext = createContext<CrmTaskModalAPI>();

function defaultDueDate() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

function defaultTitle(ctx: CrmTaskContext) {
  if (ctx.title?.trim()) return ctx.title.trim();
  if (ctx.quotation_id) return `Follow up on quotation`;
  if (ctx.sales_id) return `Follow up on sale`;
  if (ctx.purchase_request_id) return `Follow up on purchase request`;
  if (ctx.warranty_asset_id) return `Warranty follow-up`;
  if (ctx.partner_name) return `Follow up — ${ctx.partner_name}`;
  return "";
}

export function CrmTaskModalProvider(props: ParentProps) {
  const [createOpen, setCreateOpen] = createSignal(false);
  const [detailOpen, setDetailOpen] = createSignal(false);
  const [detailTaskId, setDetailTaskId] = createSignal<number | null>(null);
  const [context, setContext] = createSignal<CrmTaskContext>({});
  const [title, setTitle] = createSignal("");
  const [dueDate, setDueDate] = createSignal(defaultDueDate());
  const [notes, setNotes] = createSignal("");
  const [assigneeId, setAssigneeId] = createSignal<number | "">("");
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const auth = useAuth();
  const team = useSalesTeamMembers(() => canManageSalesTeam(auth.me));
  const invalidate = useInvalidateFollowUpTasks();
  const invalidateSummaries = useInvalidateCrmTaskSummaries();

  const resetForm = (ctx: CrmTaskContext) => {
    setTitle(defaultTitle(ctx));
    setDueDate(ctx.due_date ?? defaultDueDate());
    setNotes(ctx.notes ?? "");
    setAssigneeId("");
  };

  const openCreate = (ctx: CrmTaskContext = {}) => {
    setContext(ctx);
    resetForm(ctx);
    setCreateOpen(true);
  };

  const draftKey = () => {
    const ctx = context();
    if (ctx.quotation_id) return `quo-${ctx.quotation_id}`;
    if (ctx.sales_id) return `sales-${ctx.sales_id}`;
    if (ctx.purchase_request_id) return `pr-${ctx.purchase_request_id}`;
    if (ctx.warranty_asset_id) return `warranty-${ctx.warranty_asset_id}`;
    if (ctx.partner_id) return `partner-${ctx.partner_id}`;
    return "new";
  };

  const draft = useDocumentDraft({
    entityType: DRAFT_ENTITY.crmTask,
    draftKey,
    getPayload: () => ({ title: title(), due_date: dueDate(), notes: notes(), assignee_id: assigneeId() }),
    onApply: (payload) => {
      setTitle(payload.title);
      setDueDate(payload.due_date);
      setNotes(payload.notes);
      setAssigneeId(payload.assignee_id);
    },
    enabled: () => createOpen(),
    autoApply: () => createOpen(),
  });

  const openTask = (taskId: number) => {
    const id = Number(taskId);
    if (!Number.isFinite(id) || id <= 0) return;
    setDetailTaskId(id);
    setDetailOpen(true);
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setDetailTaskId(null);
  };

  const api: CrmTaskModalAPI = {
    open: openCreate,
    openCreate,
    openTask,
  };

  const save = async () => {
    const ctx = context();
    if (!title().trim()) {
      toast.warning("Title is required.");
      return;
    }
    setSaving(true);
    const assignee = assigneeId();
    const member =
      typeof assignee === "number" ? team.data?.find((m) => m.id === assignee) : undefined;
    const res = await createFollowUpTask({
      task_type: ctx.task_type ?? (ctx.quotation_id ? "quote_follow_up" : ctx.warranty_asset_id ? "warranty_follow_up" : "manual"),
      title: title().trim(),
      due_date: dueDate(),
      partner_id: ctx.partner_id ?? undefined,
      pic_user_id: member?.id,
      pic_name: member?.full_name ?? ctx.pic_name,
      notes: notes().trim() || undefined,
      quotation_id: ctx.quotation_id ?? undefined,
      sales_id: ctx.sales_id ?? undefined,
      purchase_request_id: ctx.purchase_request_id ?? undefined,
      warranty_asset_id: ctx.warranty_asset_id ?? undefined,
    }, { silent: true });
    setSaving(false);
    if (!res.success) {
      const existing = res.data as FollowUpTask | undefined;
      if (res.code === "ERR_CONFLICT" && existing?.id) {
        await draft.clearOnSave();
        setCreateOpen(false);
        openTask(existing.id);
        toast.warning("An open task already exists for this record.");
        return;
      }
      toast.warning(res.message ?? "Could not create task.");
      return;
    }
    await draft.clearOnSave();
    setCreateOpen(false);
    invalidate();
    invalidateSummaries();
    toast.success("CRM task created.");
  };

  return (
    <CrmTaskModalContext.Provider value={api}>
      {props.children}
      <EntityModal
        open={createOpen()}
        title="Create CRM follow-up task"
        onClose={() => setCreateOpen(false)}
        onSave={() => void save()}
        saving={saving()}
      >
        <draft.DraftBanner />
        <Show when={context().partner_name}>
          <p class="mb-3 text-sm text-text-secondary">
            Customer: <span class="font-medium text-text-primary">{context().partner_name}</span>
          </p>
        </Show>
        <Field label="Title">
          <input class={inputClass} value={title()} onInput={(e) => setTitle(e.currentTarget.value)} />
        </Field>
        <Field label="Due date">
          <DateInput value={dueDate()} onInput={(e) => setDueDate(e.currentTarget.value)} />
        </Field>
        <Show when={canManageSalesTeam(auth.me)}>
          <Field label="Assign to">
            <select
              class={inputClass}
              value={assigneeId()}
              onChange={(e) => {
                const v = e.currentTarget.value;
                setAssigneeId(v === "" ? "" : Number(v));
              }}
            >
              <option value="">Me ({auth.me?.user.full_name ?? "current user"})</option>
              {(team.data ?? []).map((m) => (
                <option value={m.id}>{m.full_name}</option>
              ))}
            </select>
          </Field>
        </Show>
        <Field label="Notes">
          <textarea
            class={`${inputClass} min-h-[4.5rem]`}
            value={notes()}
            onInput={(e) => setNotes(e.currentTarget.value)}
          />
        </Field>
      </EntityModal>
      <FollowUpTaskDetailModal
        open={() => detailOpen()}
        taskId={() => detailTaskId()}
        onClose={closeDetail}
      />
    </CrmTaskModalContext.Provider>
  );
}

export function useCrmTaskModal(): CrmTaskModalAPI {
  const ctx = useContext(CrmTaskModalContext);
  if (!ctx) throw new Error("CrmTaskModalProvider missing");
  return ctx;
}

export function useCrmTaskModalOptional(): CrmTaskModalAPI | null {
  return useContext(CrmTaskModalContext) ?? null;
}
