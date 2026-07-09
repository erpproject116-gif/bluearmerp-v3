import { createSignal, For, Show } from "solid-js";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import { hasPermission, useAuth } from "../../shared/auth-context";
import { useToast } from "../../shared/toast";
import {
  createAutomationRule,
  deleteAutomationRule,
  patchAutomationRule,
  useInvalidateOperations,
  useOperationsAutomationRules,
  useOperationsWorkspaces,
  type AutomationRule,
} from "../../shared/useOperations";
import { OperationsLayout } from "./OperationsLayout";

export default function OperationsAutomationPage() {
  const auth = useAuth();
  const toast = useToast();
  const invalidate = useInvalidateOperations();
  const canWrite = () => hasPermission(auth.me, "operations.automation", "write");
  const [workspaceId, setWorkspaceId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [ruleName, setRuleName] = createSignal("");
  const [triggerEvent, setTriggerEvent] = createSignal("work_item.created");
  const [actionType, setActionType] = createSignal("notify");
  const [saving, setSaving] = createSignal(false);

  const workspaces = useOperationsWorkspaces(() => ({ page: 1, pageSize: 50 }));
  const rules = useOperationsAutomationRules(workspaceId);

  const openNew = () => {
    setRuleName("");
    setTriggerEvent("work_item.created");
    setActionType("notify");
    setModalOpen(true);
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
      action_config: { message: "Automation triggered." },
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not create rule.");
      return;
    }
    setModalOpen(false);
    invalidate();
    toast.success("Rule created.");
  };

  const toggleActive = async (rule: AutomationRule) => {
    const res = await patchAutomationRule(rule.id, { is_active: !rule.is_active });
    if (!res.success) {
      toast.warning(res.message ?? "Could not update rule.");
      return;
    }
    invalidate();
  };

  const removeRule = async (rule: AutomationRule) => {
    if (!confirm(`Delete rule "${rule.rule_name}"?`)) return;
    const res = await deleteAutomationRule(rule.id);
    if (!res.success) {
      toast.warning(res.message ?? "Could not delete rule.");
      return;
    }
    invalidate();
    toast.success("Rule deleted.");
  };

  return (
    <OperationsLayout>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <label class="text-sm text-text-secondary">Workspace</label>
          <select
            class={inputClass}
            value={workspaceId() ?? ""}
            onChange={(e) => {
              const id = Number(e.currentTarget.value);
              setWorkspaceId(Number.isFinite(id) && id > 0 ? id : null);
            }}
          >
            <option value="">All workspaces</option>
            <For each={workspaces.data?.rows ?? []}>
              {(ws) => <option value={ws.id}>{ws.workspace_name}</option>}
            </For>
          </select>
        </div>
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
        loading={rules.isFetching}
        selectedId={null}
        onSelect={() => {}}
        onEdit={() => {}}
        onNew={openNew}
        showNew={canWrite()}
        codeKey="rule_name"
        nameKey="rule_name"
        page={1}
        pageSize={rules.data?.rows.length || 1}
        total={rules.data?.total ?? 0}
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
            <option value="work_item.quotation_created">Quotation created</option>
          </select>
        </Field>
        <Field label="Action type">
          <select class={inputClass} value={actionType()} onChange={(e) => setActionType(e.currentTarget.value)}>
            <option value="notify">Notify</option>
            <option value="log">Log event</option>
          </select>
        </Field>
      </EntityModal>
    </OperationsLayout>
  );
}
