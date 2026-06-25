import { createSignal, For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { apiFetch } from "./api";
import { FIELD_TYPES } from "./CustomFieldsSection";
import { Field, inputClass } from "./SpreadsheetGrid";
import { useAuth, canManageFormSettings } from "./auth-context";
import { useToast } from "./toast";
import { type FormFieldSetting, useFormFieldSettings } from "./useFormFieldSettings";

type Props = {
  entityType: string;
  featureLabel: string;
  listHref: string;
};

type CreatedDefinition = {
  id: number;
  entity_type: string;
  field_key: string;
  label: string;
  field_type: string;
  options?: { choices?: string[]; is_visible?: boolean };
  is_required: boolean;
  sort_order: number;
  is_active: boolean;
};

function slugKey(label: string) {
  let key = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  if (!key) key = "field";
  if (!/^[a-z]/.test(key)) key = `f_${key}`;
  return key.slice(0, 64);
}

function parseChoices(raw: string) {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatApiErrors(message?: string, errors?: Record<string, string>) {
  const parts = Object.values(errors ?? {}).filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  return message ?? "Request failed.";
}

export function EntityFormSettingsPage(props: Props) {
  const auth = useAuth();
  const toast = useToast();
  const { query, fields, reload } = useFormFieldSettings(props.entityType);

  const [draft, setDraft] = createSignal<FormFieldSetting[]>([]);
  const [dirty, setDirty] = createSignal(false);
  const [saving, setSaving] = createSignal(false);

  const [newLabel, setNewLabel] = createSignal("");
  const [newKey, setNewKey] = createSignal("");
  const [newType, setNewType] = createSignal("text");
  const [newRequired, setNewRequired] = createSignal(false);
  const [newChoices, setNewChoices] = createSignal("");
  const [adding, setAdding] = createSignal(false);

  const canEdit = () => canManageFormSettings(auth.me);

  const rows = () => (dirty() ? draft() : fields());

  const syncDraft = () => {
    setDraft([...fields()]);
    setDirty(true);
  };

  const updateRow = (fieldKey: string, patch: Partial<FormFieldSetting>) => {
    if (!dirty()) syncDraft();
    setDraft((list) => list.map((r) => (r.field_key === fieldKey ? { ...r, ...patch } : r)));
  };

  const save = async () => {
    if (!canEdit()) return;
    setSaving(true);
    const payload = rows();
    const res = await apiFetch<{ fields: FormFieldSetting[] }>(
      `/api/v1/form-field-settings?entity_type=${encodeURIComponent(props.entityType)}`,
      { method: "PATCH", body: JSON.stringify({ fields: payload }) },
      { successMessage: "Form settings saved." },
    );
    setSaving(false);
    if (!res.success) {
      toast.error(formatApiErrors(res.message, res.errors));
      return;
    }
    setDirty(false);
    await reload();
  };

  const addCustomField = async () => {
    if (!newLabel().trim()) {
      toast.warning("Field label is required.");
      return;
    }
    const needsChoices = newType() === "select" || newType() === "radio";
    if (needsChoices && parseChoices(newChoices()).length === 0) {
      toast.warning("Add at least one choice for dropdown or radio fields.");
      return;
    }
    setAdding(true);
    const key = slugKey(newKey().trim() || newLabel());
    const label = newLabel().trim();
    const res = await apiFetch<CreatedDefinition>(
      "/api/v1/custom-fields",
      {
        method: "POST",
        body: JSON.stringify({
          entity_type: props.entityType,
          field_key: key,
          label,
          field_type: newType(),
          is_required: newRequired(),
          sort_order: fields().filter((f) => f.kind === "custom").length,
          options: needsChoices ? { choices: parseChoices(newChoices()) } : {},
        }),
      },
      { successMessage: `Custom field "${label}" added.` },
    );
    setAdding(false);
    if (!res.success || !res.data?.id) {
      toast.error(formatApiErrors(res.message, res.errors));
      return;
    }
    setNewLabel("");
    setNewKey("");
    setNewType("text");
    setNewRequired(false);
    setNewChoices("");
    setDirty(false);
    const refreshed = await reload();
    const saved = (refreshed.data?.fields ?? []).some(
      (f) => f.kind === "custom" && f.field_key === res.data!.field_key,
    );
    if (!saved) {
      toast.error(
        "Custom field was not saved. Apply database migration 027_custom_field_persistence.sql and restart the API.",
      );
      return;
    }
  };

  const removeCustomField = async (id: number | undefined, label: string) => {
    if (!id) return;
    const res = await apiFetch(`/api/v1/custom-fields/${id}`, { method: "DELETE" }, {
      successMessage: `Custom field "${label}" disabled.`,
    });
    if (!res.success) {
      toast.error(formatApiErrors(res.message, res.errors));
      return;
    }
    setDirty(false);
    await reload();
  };

  const sortedRows = () => [...rows()].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div class="mx-auto max-w-5xl">
      <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p class="text-sm text-text-secondary">
            <A href={props.listHref} class="text-brand-600 hover:underline">
              {props.featureLabel}
            </A>
            {" / "}Form settings
          </p>
          <h2 class="mt-1 text-lg font-semibold text-text-primary">{props.featureLabel} form fields</h2>
          <p class="mt-1 text-sm text-text-secondary">
            Configure labels, visibility, required rules, and custom fields for the new-row form.
          </p>
        </div>
        <Show when={canEdit()}>
          <button
            type="button"
            class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            disabled={saving() || !dirty()}
            onClick={() => void save()}
          >
            Save changes
          </button>
        </Show>
      </div>

      <Show when={!auth.loading && !canEdit()}>
        <p class="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Only store admins, owners, and superadmins can change form settings.
        </p>
      </Show>

      <div class="overflow-hidden rounded-xl border border-stroke bg-white shadow-sm">
        <table class="erp-grid w-full text-left text-sm">
          <thead class="text-xs uppercase tracking-wide text-text-secondary">
            <tr>
              <th class="px-4 py-3 font-semibold">Field</th>
              <th class="px-4 py-3 font-semibold">Type</th>
              <th class="px-4 py-3 font-semibold">Label</th>
              <th class="px-4 py-3 font-semibold">Visible</th>
              <th class="px-4 py-3 font-semibold">Required</th>
              <th class="px-4 py-3 font-semibold">Disabled</th>
              <th class="px-4 py-3 font-semibold">Active</th>
              <th class="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            <Show when={query.isFetching && !fields().length}>
              <tr>
                <td colSpan={8} class="px-4 py-8 text-center text-text-secondary">
                  Loading…
                </td>
              </tr>
            </Show>
            <For each={sortedRows()}>
              {(row) => (
                <tr>
                  <td class="px-4 py-3">
                    <span class="font-medium text-text-primary">{row.field_key}</span>
                    <span class="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-text-secondary">{row.kind}</span>
                  </td>
                  <td class="px-4 py-3 text-text-secondary">{row.field_type}</td>
                  <td class="px-4 py-3">
                    <input
                      class={inputClass}
                      value={row.label}
                      disabled={!canEdit()}
                      onInput={(e) => updateRow(row.field_key, { label: e.currentTarget.value })}
                    />
                  </td>
                  <td class="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={row.is_visible}
                      disabled={!canEdit()}
                      onChange={(e) => updateRow(row.field_key, { is_visible: e.currentTarget.checked })}
                    />
                  </td>
                  <td class="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={row.is_required}
                      disabled={!canEdit()}
                      onChange={(e) => updateRow(row.field_key, { is_required: e.currentTarget.checked })}
                    />
                  </td>
                  <td class="px-4 py-3">
                    <Show when={row.kind === "standard"} fallback={<span class="text-text-secondary">—</span>}>
                      <input
                        type="checkbox"
                        checked={row.is_disabled}
                        disabled={!canEdit()}
                        onChange={(e) => updateRow(row.field_key, { is_disabled: e.currentTarget.checked })}
                      />
                    </Show>
                  </td>
                  <td class="px-4 py-3">
                    <Show when={row.kind === "custom"} fallback={<span class="text-text-secondary">—</span>}>
                      <input
                        type="checkbox"
                        checked={row.is_active}
                        disabled={!canEdit()}
                        onChange={(e) =>
                          updateRow(row.field_key, {
                            is_active: e.currentTarget.checked,
                            is_visible: e.currentTarget.checked ? row.is_visible : false,
                          })
                        }
                      />
                    </Show>
                  </td>
                  <td class="px-4 py-3">
                    <Show when={row.kind === "custom" && canEdit()}>
                      <button
                        type="button"
                        class="text-xs text-red-600 hover:underline"
                        onClick={() => void removeCustomField(row.id, row.label)}
                      >
                        Remove
                      </button>
                    </Show>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>

      <Show when={canEdit()}>
        <div class="mt-8">
          <h3 class="mb-3 text-sm font-semibold text-text-primary">Add custom field</h3>
          <div class="grid grid-cols-1 gap-3 rounded-xl border border-dashed border-brand-200 bg-brand-50/40 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Field label">
              <input class={inputClass} value={newLabel()} onInput={(e) => setNewLabel(e.currentTarget.value)} placeholder="e.g. Tax ID" />
            </Field>
            <Field label="Field key (optional)">
              <input
                class={inputClass}
                value={newKey()}
                onInput={(e) => setNewKey(e.currentTarget.value)}
                placeholder={slugKey(newLabel()) || "tax_id"}
              />
            </Field>
            <Field label="Field type">
              <select class={inputClass} value={newType()} onChange={(e) => setNewType(e.currentTarget.value)}>
                <For each={FIELD_TYPES}>{(t) => <option value={t.value}>{t.label}</option>}</For>
              </select>
            </Field>
            <Show when={newType() === "select" || newType() === "radio"}>
              <Field label="Choices (comma-separated)" span="full">
                <input
                  class={inputClass}
                  value={newChoices()}
                  onInput={(e) => setNewChoices(e.currentTarget.value)}
                  placeholder="Option A, Option B"
                />
              </Field>
            </Show>
            <label class="flex items-center gap-2 text-sm text-text-primary">
              <input type="checkbox" checked={newRequired()} onChange={(e) => setNewRequired(e.currentTarget.checked)} />
              Required field
            </label>
            <div class="flex items-end sm:col-span-2 lg:col-span-3">
              <button
                type="button"
                class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                disabled={adding()}
                onClick={() => void addCustomField()}
              >
                Add custom field
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
