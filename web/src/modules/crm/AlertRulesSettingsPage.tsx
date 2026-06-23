import { For, Show } from "solid-js";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { canManageCrmRules, useAuth } from "../../shared/auth-context";
import { patchCrmAlertRule, useCrmAlertRules, useInvalidateCrmReports } from "../../shared/useCrmReports";
import { useToast } from "../../shared/toast";
import { CrmLayout } from "./CrmLayout";

const RULE_TYPE_LABELS: Record<string, string> = {
  warranty_follow_up: "Warranty follow-up",
  quote_expiring: "Quote expiring",
  low_stock: "Low stock",
  quote_unconverted: "Unconverted quotes",
  custom_kpi: "Custom KPI",
};

export default function AlertRulesSettingsPage() {
  const auth = useAuth();
  const canEdit = () => canManageCrmRules(auth.me);
  const rules = useCrmAlertRules();
  const toast = useToast();
  const invalidate = useInvalidateCrmReports();

  const toggleEnabled = async (id: number, isEnabled: boolean) => {
    if (!canEdit()) return;
    const res = await patchCrmAlertRule(id, { is_enabled: !isEnabled });
    if (!res.success) {
      toast.warning(res.message ?? "Could not update rule.");
      return;
    }
    invalidate();
  };

  const updateLead = async (id: number, leadValue: number, leadUnit: string) => {
    if (!canEdit()) return;
    const res = await patchCrmAlertRule(id, { lead_value: leadValue, lead_unit: leadUnit });
    if (!res.success) {
      toast.warning(res.message ?? "Could not update rule.");
      return;
    }
    invalidate();
  };

  return (
    <CrmLayout>
      <div class="mb-4">
        <p class="text-sm text-text-secondary">
          Configure when CRM generates notifications and follow-up tasks.
          <Show when={!canEdit()}>
            <span class="ml-1 text-amber-600">Read-only — you need CRM rules permission to edit.</span>
          </Show>
        </p>
      </div>

      <Show when={rules.isFetching}>
        <p class="text-sm text-text-secondary">Loading rules…</p>
      </Show>

      <div class="space-y-3">
        <For each={rules.data ?? []}>
          {(rule) => (
            <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 class="font-medium text-text-primary">{rule.name}</h3>
                  <p class="text-xs text-text-secondary">{RULE_TYPE_LABELS[rule.rule_type] ?? rule.rule_type}</p>
                </div>
                <label class="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={rule.is_enabled}
                    disabled={!canEdit()}
                    onChange={() => void toggleEnabled(rule.id, rule.is_enabled)}
                  />
                  Enabled
                </label>
              </div>
              <div class="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Lead value">
                  <input
                    type="number"
                    min="0"
                    class={inputClass}
                    value={rule.lead_value}
                    disabled={!canEdit()}
                    onChange={(e) =>
                      void updateLead(rule.id, Number(e.currentTarget.value), rule.lead_unit)
                    }
                  />
                </Field>
                <Field label="Lead unit">
                  <select
                    class={inputClass}
                    value={rule.lead_unit}
                    disabled={!canEdit()}
                    onChange={(e) => void updateLead(rule.id, rule.lead_value, e.currentTarget.value)}
                  >
                    <option value="days">Days</option>
                    <option value="months">Months</option>
                  </select>
                </Field>
              </div>
            </section>
          )}
        </For>
      </div>
    </CrmLayout>
  );
}
