import { createSignal, createEffect, createMemo, For, Index, Show } from "solid-js";
import { A } from "@solidjs/router";
import { apiFetch } from "./api";
import { FIELD_TYPES, isCustomFieldType, type CustomFieldType } from "./CustomFieldsSection";
import { Field, inputClass } from "./SpreadsheetGrid";
import { useAuth, canManageFormSettings } from "./auth-context";
import { useToast } from "./toast";
import {
  type CustomFieldDefinition,
  type FormFieldSetting,
  useFormFieldSettings,
} from "./useFormFieldSettings";
import {
  hasLineColumnLabels,
  hasListColumnSettings,
  lineViewKey,
  listViewKey,
  type ColumnLabelSetting,
  useColumnLabelSettings,
} from "./useColumnLabelSettings";
import { uiLabel } from "./branding/uiLabel";
import { ProcessRulesPanel } from "./ProcessRulesPanel";
import { ENTITY_PROCESS_SETUP } from "./processPolicyFieldMeta";

type Props = {
  entityType: string;
  featureLabel: string;
  listHref: string;
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
  const { query, fields, reload, upsertCustomField } = useFormFieldSettings(props.entityType);
  const lineLabels = useColumnLabelSettings(lineViewKey(props.entityType));
  const listLabels = useColumnLabelSettings(
    hasListColumnSettings(props.entityType) ? listViewKey(props.entityType) : "",
  );
  const showLineColumns = () => hasLineColumnLabels(props.entityType);
  const showListColumns = () => hasListColumnSettings(props.entityType);

  const [draft, setDraft] = createSignal<FormFieldSetting[]>([]);
  const [columnDraft, setColumnDraft] = createSignal<ColumnLabelSetting[]>([]);
  const [listColumnDraft, setListColumnDraft] = createSignal<ColumnLabelSetting[]>([]);
  const [dirty, setDirty] = createSignal(false);
  const [columnDirty, setColumnDirty] = createSignal(false);
  const [listColumnDirty, setListColumnDirty] = createSignal(false);
  const [saving, setSaving] = createSignal(false);

  const [newLabel, setNewLabel] = createSignal("");
  const [newKey, setNewKey] = createSignal("");
  const [newType, setNewType] = createSignal<CustomFieldType>("text");
  const [newRequired, setNewRequired] = createSignal(false);
  const [newChoices, setNewChoices] = createSignal("");
  const [adding, setAdding] = createSignal(false);

  const canEdit = () => canManageFormSettings(auth.me);
  const processSetup = () => ENTITY_PROCESS_SETUP[props.entityType] ?? null;

  createEffect(() => {
    if (!dirty()) {
      setDraft([...fields()]);
    }
  });

  createEffect(() => {
    if (!columnDirty()) {
      setColumnDraft([...lineLabels.columns()]);
    }
  });

  createEffect(() => {
    if (!listColumnDirty()) {
      setListColumnDraft(
        listLabels.columns().map((c) => ({
          ...c,
          is_visible: c.is_visible !== false,
        })),
      );
    }
  });

  const sortedRows = createMemo(() => [...draft()].sort((a, b) => a.sort_order - b.sort_order));
  const sortedColumnRows = createMemo(() => [...columnDraft()].sort((a, b) => a.sort_order - b.sort_order));
  const sortedListColumnRows = createMemo(() =>
    [...listColumnDraft()].sort((a, b) => a.sort_order - b.sort_order),
  );

  const updateColumnRow = (columnKey: string, label: string) => {
    setColumnDirty(true);
    setColumnDraft((list) => list.map((r) => (r.column_key === columnKey ? { ...r, label } : r)));
  };

  const updateListColumnRow = (columnKey: string, patch: Partial<ColumnLabelSetting>) => {
    setListColumnDirty(true);
    setListColumnDraft((list) => list.map((r) => (r.column_key === columnKey ? { ...r, ...patch } : r)));
  };

  const saveColumnLabels = async () => {
    if (!canEdit() || !showLineColumns()) return;
    setSaving(true);
    try {
      await lineLabels.save(sortedColumnRows());
      setColumnDirty(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save column labels.");
    } finally {
      setSaving(false);
    }
  };

  const saveListColumns = async () => {
    if (!canEdit() || !showListColumns()) return;
    setSaving(true);
    try {
      await listLabels.save(
        sortedListColumnRows().map((c) => ({
          ...c,
          is_visible: c.is_visible !== false,
        })),
      );
      setListColumnDirty(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save list columns.");
    } finally {
      setSaving(false);
    }
  };

  const updateRow = (fieldKey: string, patch: Partial<FormFieldSetting>) => {
    setDirty(true);
    setDraft((list) => list.map((r) => (r.field_key === fieldKey ? { ...r, ...patch } : r)));
  };

  const save = async () => {
    if (!canEdit()) return;
    setSaving(true);
    const payload = draft();
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
    const fieldType = newType();
    if (!isCustomFieldType(fieldType)) {
      toast.warning("Unsupported field type.");
      return;
    }
    setAdding(true);
    const key = slugKey(newKey().trim() || newLabel());
    const label = newLabel().trim();
    const res = await apiFetch<CustomFieldDefinition>(
      "/api/v1/custom-fields",
      {
        method: "POST",
        body: JSON.stringify({
          entity_type: props.entityType,
          field_key: key,
          label,
          field_type: fieldType,
          is_required: newRequired(),
          sort_order: fields().filter((f) => f.kind === "custom").length,
          options: needsChoices ? { choices: parseChoices(newChoices()), is_visible: true } : { is_visible: true },
        }),
      },
      { successMessage: `Custom field "${label}" added.` },
    );
    setAdding(false);
    if (!res.success || !res.data?.id) {
      toast.error(formatApiErrors(res.message, res.errors));
      return;
    }
    const created = res.data;
    upsertCustomField(created);
    setNewLabel("");
    setNewKey("");
    setNewType("text");
    setNewRequired(false);
    setNewChoices("");
    setDirty(false);

    const refreshed = await reload();
    const inSettings = refreshed.fields.some(
      (f) => f.kind === "custom" && (f.id === created.id || f.field_key === created.field_key),
    );
    if (inSettings) return;

    const listRes = await apiFetch<CustomFieldDefinition[]>(
      `/api/v1/custom-fields?entity_type=${encodeURIComponent(props.entityType)}&active_only=false`,
      {},
      { silent: true },
    );
    const inDefinitions = (listRes.data ?? []).some((d) => d.id === created.id);
    if (inDefinitions) {
      upsertCustomField(created);
      return;
    }

    toast.error(
      "Custom field was not saved. Run api/migrations/004_custom_fields.sql and 027_custom_field_persistence.sql on the API database, then restart the API.",
    );
  };

  const removeCustomField = async (id: number | undefined, label: string) => {
    if (!id) {
      toast.error(`Cannot remove "${label}" — missing field id. Refresh the page and try again.`);
      return;
    }
    if (!window.confirm(`Remove custom field "${label}"? It will be hidden from forms (soft delete).`)) {
      return;
    }
    const res = await apiFetch(`/api/v1/custom-fields/${id}`, { method: "DELETE" }, {
      successMessage: `Custom field "${label}" removed.`,
    });
    if (!res.success) {
      toast.error(formatApiErrors(res.message, res.errors));
      return;
    }
    setDirty(false);
    await reload();
  };

  return (
    <div class="mx-auto max-w-6xl">
      <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p class="text-sm text-text-secondary">
            <A href={props.listHref} class="text-brand-600 hover:underline">
              {props.featureLabel}
            </A>
            {" / "}{uiLabel("form_settings.breadcrumb_suffix")}
          </p>
          <h2 class="mt-1 text-lg font-semibold text-text-primary">
            {props.featureLabel} {uiLabel("form_settings.page_title_suffix")}
          </h2>
          <p class="mt-1 text-sm text-text-secondary">{uiLabel("form_settings.description")}</p>
        </div>
        <Show when={canEdit()}>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              disabled={saving() || !dirty()}
              onClick={() => void save()}
            >
              {uiLabel("form_settings.save_fields")}
            </button>
            <Show when={showLineColumns()}>
              <button
                type="button"
                class="rounded-lg border border-stroke px-4 py-2 text-sm font-medium text-text-primary hover:bg-slate-50 disabled:opacity-50"
                disabled={saving() || !columnDirty()}
                onClick={() => void saveColumnLabels()}
              >
                {uiLabel("form_settings.save_line_columns")}
              </button>
            </Show>
            <Show when={showListColumns()}>
              <button
                type="button"
                class="rounded-lg border border-stroke px-4 py-2 text-sm font-medium text-text-primary hover:bg-slate-50 disabled:opacity-50"
                disabled={saving() || !listColumnDirty()}
                onClick={() => void saveListColumns()}
              >
                {uiLabel("form_settings.save_list_columns")}
              </button>
            </Show>
          </div>
        </Show>
      </div>

      <Show when={!auth.bootstrapping && !canEdit()}>
        <p class="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Only store admins, owners, and superadmins can change form settings.
        </p>
      </Show>

      <Show when={processSetup()}>
        {(setup) => (
          <div class="mb-6">
            <ProcessRulesPanel
              scopeId={setup().scopeId}
              title={setup().title}
              compact
            />
            <p class="mt-2 text-xs text-text-secondary">
              Prefer the full{" "}
              <A href={setup().setupHref} class="text-brand-600 hover:underline">
                module Setup tab
              </A>{" "}
              for the same rules in context.
            </p>
          </div>
        )}
      </Show>

      <div class="overflow-x-auto rounded-xl border border-stroke bg-white shadow-sm">
        <div class="border-b border-stroke px-4 py-3">
          <h3 class="text-sm font-semibold text-text-primary">{uiLabel("form_settings.form_fields_heading")}</h3>
          <p class="mt-1 text-xs text-text-secondary">{uiLabel("form_settings.form_fields_description")}</p>
        </div>
        <table class="erp-grid min-w-[56rem] w-full text-left text-sm">
          <thead class="text-xs uppercase tracking-wide text-text-secondary">
            <tr>
              <th class="px-4 py-3 font-semibold">Field</th>
              <th class="px-4 py-3 font-semibold">Type</th>
              <th class="px-4 py-3 font-semibold">Label</th>
              <th class="px-4 py-3 font-semibold">Placeholder</th>
              <th class="px-4 py-3 font-semibold">Visible</th>
              <th class="px-4 py-3 font-semibold">Required</th>
              <th class="px-4 py-3 font-semibold">Disabled</th>
              <th class="px-4 py-3 font-semibold">Active</th>
              <th class="sticky right-0 bg-white px-4 py-3 font-semibold shadow-[-4px_0_8px_rgba(15,23,42,0.06)]">Actions</th>
            </tr>
          </thead>
          <tbody>
            <Show when={query.isFetching && !fields().length}>
              <tr>
                <td colSpan={9} class="px-4 py-8 text-center text-text-secondary">
                  {uiLabel("common.loading")}
                </td>
              </tr>
            </Show>
            <Index each={sortedRows()}>
              {(row) => (
                <tr>
                  <td class="px-4 py-3">
                    <span class="font-medium text-text-primary">{row().field_key}</span>
                    <span class="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-text-secondary">{row().kind}</span>
                  </td>
                  <td class="px-4 py-3 text-text-secondary">{row().field_type}</td>
                  <td class="px-4 py-3">
                    <input
                      class={inputClass}
                      value={row().label}
                      disabled={!canEdit()}
                      onInput={(e) => updateRow(row().field_key, { label: e.currentTarget.value })}
                    />
                  </td>
                  <td class="px-4 py-3">
                    <input
                      class={inputClass}
                      value={row().placeholder ?? ""}
                      disabled={!canEdit()}
                      placeholder="Optional"
                      onInput={(e) => updateRow(row().field_key, { placeholder: e.currentTarget.value })}
                    />
                  </td>
                  <td class="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={row().is_visible}
                      disabled={!canEdit()}
                      onChange={(e) => updateRow(row().field_key, { is_visible: e.currentTarget.checked })}
                    />
                  </td>
                  <td class="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={row().is_required}
                      disabled={!canEdit()}
                      onChange={(e) => updateRow(row().field_key, { is_required: e.currentTarget.checked })}
                    />
                  </td>
                  <td class="px-4 py-3">
                    <Show when={row().kind === "standard"} fallback={<span class="text-text-secondary">—</span>}>
                      <input
                        type="checkbox"
                        checked={row().is_disabled}
                        disabled={!canEdit()}
                        onChange={(e) => updateRow(row().field_key, { is_disabled: e.currentTarget.checked })}
                      />
                    </Show>
                  </td>
                  <td class="px-4 py-3">
                    <Show when={row().kind === "custom"} fallback={<span class="text-text-secondary">—</span>}>
                      <input
                        type="checkbox"
                        checked={row().is_active}
                        disabled={!canEdit()}
                        onChange={(e) =>
                          updateRow(row().field_key, {
                            is_active: e.currentTarget.checked,
                            is_visible: e.currentTarget.checked ? row().is_visible : false,
                          })
                        }
                      />
                    </Show>
                  </td>
                  <td class="sticky right-0 bg-white px-4 py-3 shadow-[-4px_0_8px_rgba(15,23,42,0.06)]">
                    <Show when={row().kind === "custom" && canEdit()}>
                      <button
                        type="button"
                        class="text-xs font-medium text-red-600 hover:underline"
                        onClick={() => void removeCustomField(row().id, row().label)}
                      >
                        Remove
                      </button>
                    </Show>
                  </td>
                </tr>
              )}
            </Index>
          </tbody>
        </table>
      </div>

      <Show when={showLineColumns()}>
        <div class="mt-10 overflow-x-auto rounded-xl border border-stroke bg-white shadow-sm">
          <div class="border-b border-stroke px-4 py-3">
            <h3 class="text-sm font-semibold text-text-primary">{uiLabel("form_settings.line_column_heading")}</h3>
            <p class="mt-1 text-xs text-text-secondary">{uiLabel("form_settings.line_column_description")}</p>
          </div>
          <table class="erp-grid w-full text-left text-sm">
            <thead class="text-xs uppercase tracking-wide text-text-secondary">
              <tr>
                <th class="px-4 py-3 font-semibold">Column</th>
                <th class="px-4 py-3 font-semibold">Header label</th>
              </tr>
            </thead>
            <tbody>
              <Index each={sortedColumnRows()}>
                {(row) => (
                  <tr>
                    <td class="px-4 py-3 font-medium text-text-primary">{row().column_key}</td>
                    <td class="px-4 py-3">
                      <input
                        class={inputClass}
                        value={row().label}
                        disabled={!canEdit()}
                        onInput={(e) => updateColumnRow(row().column_key, e.currentTarget.value)}
                      />
                    </td>
                  </tr>
                )}
              </Index>
            </tbody>
          </table>
        </div>
      </Show>

      <Show when={showListColumns()}>
        <div class="mt-10 overflow-x-auto rounded-xl border border-stroke bg-white shadow-sm">
          <div class="border-b border-stroke px-4 py-3">
            <h3 class="text-sm font-semibold text-text-primary">{uiLabel("form_settings.list_column_heading")}</h3>
            <p class="mt-1 text-xs text-text-secondary">
              {uiLabel("form_settings.list_column_description")}{" "}
              <A href={props.listHref} class="text-brand-600 hover:underline">
                Open list
              </A>
            </p>
          </div>
          <table class="erp-grid w-full text-left text-sm">
            <thead class="text-xs uppercase tracking-wide text-text-secondary">
              <tr>
                <th class="px-4 py-3 font-semibold">Column</th>
                <th class="px-4 py-3 font-semibold">Header label</th>
                <th class="px-4 py-3 font-semibold">Visible</th>
              </tr>
            </thead>
            <tbody>
              <Index each={sortedListColumnRows()}>
                {(row) => (
                  <tr>
                    <td class="px-4 py-3 font-medium text-text-primary">{row().column_key}</td>
                    <td class="px-4 py-3">
                      <input
                        class={inputClass}
                        value={row().label}
                        disabled={!canEdit()}
                        onInput={(e) => updateListColumnRow(row().column_key, { label: e.currentTarget.value })}
                      />
                    </td>
                    <td class="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={row().is_visible !== false}
                        disabled={!canEdit()}
                        onChange={(e) =>
                          updateListColumnRow(row().column_key, { is_visible: e.currentTarget.checked })
                        }
                      />
                    </td>
                  </tr>
                )}
              </Index>
            </tbody>
          </table>
        </div>
      </Show>

      <Show when={canEdit()}>
        <div class="mt-8">
          <h3 class="mb-3 text-sm font-semibold text-text-primary">{uiLabel("form_settings.add_custom_field")}</h3>
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
              <select
                class={inputClass}
                value={newType()}
                onInput={(e) => {
                  const value = e.currentTarget.value;
                  if (isCustomFieldType(value)) setNewType(value);
                }}
              >
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
