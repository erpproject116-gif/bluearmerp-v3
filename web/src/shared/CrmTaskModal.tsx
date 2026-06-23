import { createContext, createSignal, Show, useContext, type ParentProps } from "solid-js";
import { EntityModal, Field, inputClass } from "./SpreadsheetGrid";
import {
  createFollowUpTask,
  useInvalidateFollowUpTasks,
  type FollowUpTaskType,
} from "./useFollowUpTasks";
import { useToast } from "./toast";
import { canManageSalesTeam, useAuth } from "./auth-context";
import { useSalesTeamMembers } from "./useSalesTeamMembers";

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
  warranty_asset_id?: number | null;
};

type CrmTaskModalAPI = {
  open: (context?: CrmTaskContext) => void;
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
  if (ctx.warranty_asset_id) return `Warranty follow-up`;
  if (ctx.partner_name) return `Follow up — ${ctx.partner_name}`;
  return "";
}

export function CrmTaskModalProvider(props: ParentProps) {
  const [open, setOpen] = createSignal(false);
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

  const resetForm = (ctx: CrmTaskContext) => {
    setTitle(defaultTitle(ctx));
    setDueDate(ctx.due_date ?? defaultDueDate());
    setNotes(ctx.notes ?? "");
    setAssigneeId("");
  };

  const api: CrmTaskModalAPI = {
    open: (ctx = {}) => {
      setContext(ctx);
      resetForm(ctx);
      setOpen(true);
    },
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
      warranty_asset_id: ctx.warranty_asset_id ?? undefined,
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not create task.");
      return;
    }
    toast.success("CRM task created.");
    setOpen(false);
    invalidate();
  };

  return (
    <CrmTaskModalContext.Provider value={api}>
      {props.children}
      <EntityModal
        open={open()}
        title="Create CRM follow-up task"
        onClose={() => setOpen(false)}
        onSave={() => void save()}
        saving={saving()}
      >
        <Show when={context().partner_name}>
          <p class="mb-3 text-sm text-text-secondary">
            Customer: <span class="font-medium text-text-primary">{context().partner_name}</span>
          </p>
        </Show>
        <Field label="Title">
          <input class={inputClass} value={title()} onInput={(e) => setTitle(e.currentTarget.value)} />
        </Field>
        <Field label="Due date">
          <input
            type="date"
            class={inputClass}
            value={dueDate()}
            onInput={(e) => setDueDate(e.currentTarget.value)}
          />
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
