import { createSignal, Show } from "solid-js";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import { hasPermission, useAuth } from "../../shared/auth-context";
import { useToast } from "../../shared/toast";
import { useListState } from "../../shared/useListState";
import {
  createAutomationRule,
  deleteAutomationRule,
  patchAutomationRule,
  useInvalidateAutomationRules,
  useOperationsAutomationRules,
  type AutomationRule,
} from "../../shared/useOperations";
import { OperationsLayout } from "./OperationsLayout";
import { OperationsWorkspaceSelector, useOperationsWorkspace } from "./operationsWorkspace";

export default function OperationsAutomationPage() {
  const auth = useAuth();
  const toast = useToast();
  const invalidateRules = useInvalidateAutomationRules();
  const { workspaceId } = useOperationsWorkspace();
  const canWrite = () => hasPermission(auth.me, "operations.automation", "write");
  const [modalOpen, setModalOpen] = createSignal(false);
  const [ruleName, setRuleName] = createSignal("");
  const [triggerEvent, setTriggerEvent] = createSignal("work_item.created");
  const [actionType, setActionType] = createSignal("notify");
  const [message, setMessage] = createSignal("Automation triggered.");
  const [setStatus, setSetStatus] = createSignal("done");
  const [setPriority, setSetPriority] = createSignal("high");
  const [saving, setSaving] = createSignal(false);

  const { page, setPage, pageSize, setPageSize } = useListState("rule_name", 25);
  const rules = useOperationsAutomationRules(() => ({
    workspace_id: workspaceId() ?? undefined,
    page: page(),
    pageSize: pageSize(),
  }));

  const openNew = () => {
    setRuleName("");
    setTriggerEvent("work_item.created");
    setActionType("notify");
    setMessage("Automation triggered.");
    setSetStatus("done");
    setSetPriority("high");
    setModalOpen(true);
  };

  const actionConfig = () => {
    switch (actionType()) {
      case "set_status":
        return { status: setStatus() };
      case "set_priority":
        return { priority: setPriority() };
      default:
        return { message: message().trim() || "Automation triggered." };
    }
  };

  const saveRule = async () => {
    if (!ruleName().trim()) {
      toast.warning("Rule name is required.");
      return;
    }
    setSaving(true);
    const res = await createAutomationRule({
      workspace_id: workspaceId() ?? undefined,
      rule_name: ruleName().trim(),
      trigger_event: triggerEvent(),
      action_type: actionType(),
      action_config: actionConfig(),
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not create rule.");
      return;
    }
    setModalOpen(false);
    invalidateRules();
    toast.success("Rule created.");
  };

  const toggleActive = async (rule: AutomationRule) => {
    const res = await patchAutomationRule(rule.id, { is_active: !rule.is_active });
    if (!res.success) {
      toast.warning(res.message ?? "Could not update rule.");
      return;
    }
    invalidateRules();
  };

  const removeRule = async (rule: AutomationRule) => {
    if (!confirm(`Delete rule "${rule.rule_name}"?`)) return;
    const res = await deleteAutomationRule(rule.id);
    if (!res.success) {
      toast.warning(res.message ?? "Could not delete rule.");
      return;
    }
    invalidateRules();
    toast.success("Rule deleted.");
  };

  return (
    <OperationsLayout>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <OperationsWorkspaceSelector allowAll />
        <Show when={canWrite()}>
          <button
            type="button"
            class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            onClick={openNew}
          >
            + Rule
          </button>
        </Show>
      </div>

      <p class="mb-3 text-sm text-text-secondary">
        Rules run when work items are created, moved, or status-changed. Notify/log actions appear in Activity Log;
        set status/priority update the card automatically.
      </p>

      <Show when={rules.isError}>
        <p class="mb-3 text-sm text-red-600">
          {(rules.error as Error)?.message ?? "Failed to load automation rules."}
        </p>
      </Show>

      <SpreadsheetGrid
        columns={[
          { key: "rule_name", header: "Rule", clickable: true },
          { key: "trigger_event", header: "Trigger" },
          { key: "action_type", header: "Action" },
          {
            key: "is_active",
            header: "Active",
            render: (r) => (r.is_active ? "Yes" : "No"),
          },
          {
            key: "actions",
            header: "",
            render: (r) => (
              <Show when={canWrite()}>
                <div class="flex gap-2">
                  <button type="button" class="text-xs text-brand-600 hover:underline" onClick={() => void toggleActive(r)}>
                    {r.is_active ? "Disable" : "Enable"}
                  </button>
                  <button type="button" class="text-xs text-red-600 hover:underline" onClick={() => void removeRule(r)}>
                    Delete
                  </button>
                </div>
              </Show>
            ),
          },
        ]}
        rows={rules.data?.rows ?? []}
        loading={rules.isFetching && !rules.data}
        selectedId={null}
        onSelect={() => {}}
        onEdit={() => {}}
        onNew={openNew}
        showNew={canWrite()}
        codeKey="rule_name"
        nameKey="rule_name"
        page={page()}
        pageSize={pageSize()} onPageSizeChange={setPageSize}
        total={rules.data?.total ?? 0}
        onPageChange={setPage}
      />

      <EntityModal
        open={modalOpen()}
        title="New automation rule"
        onClose={() => setModalOpen(false)}
        onSave={() => void saveRule()}
        saving={saving()}
      >
        <Field label="Rule name">
          <input class={inputClass} value={ruleName()} onInput={(e) => setRuleName(e.currentTarget.value)} />
        </Field>
        <Field label="Trigger event">
          <select class={inputClass} value={triggerEvent()} onChange={(e) => setTriggerEvent(e.currentTarget.value)}>
            <option value="work_item.created">Work item created</option>
            <option value="work_item.column_changed">Column changed</option>
            <option value="work_item.status_changed">Status changed</option>
            <option value="work_item.quotation_created">Quotation created</option>
          </select>
        </Field>
        <Field label="Action type">
          <select class={inputClass} value={actionType()} onChange={(e) => setActionType(e.currentTarget.value)}>
            <option value="notify">Notify (Activity Log)</option>
            <option value="log">Log event</option>
            <option value="set_status">Set status</option>
            <option value="set_priority">Set priority</option>
          </select>
        </Field>
        <Show when={actionType() === "notify" || actionType() === "log"}>
          <Field label="Message">
            <input class={inputClass} value={message()} onInput={(e) => setMessage(e.currentTarget.value)} />
          </Field>
        </Show>
        <Show when={actionType() === "set_status"}>
          <Field label="Status">
            <select class={inputClass} value={setStatus()} onChange={(e) => setSetStatus(e.currentTarget.value)}>
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="done">Done</option>
              <option value="blocked">Blocked</option>
            </select>
          </Field>
        </Show>
        <Show when={actionType() === "set_priority"}>
          <Field label="Priority">
            <select class={inputClass} value={setPriority()} onChange={(e) => setSetPriority(e.currentTarget.value)}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </Field>
        </Show>
      </EntityModal>
    </OperationsLayout>
  );
}
