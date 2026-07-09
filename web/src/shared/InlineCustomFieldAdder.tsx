import { createSignal, For, Show } from "solid-js";
import { apiFetch } from "./api";
import { canManageFormSettings, useAuth } from "./auth-context";
import { FIELD_TYPES, isCustomFieldType, type CustomFieldType } from "./CustomFieldsSection";
import { Field, inputClass } from "./SpreadsheetGrid";
import { useToast } from "./toast";
import {
  type CustomFieldDefinition,
  useFormFieldSettings,
} from "./useFormFieldSettings";

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

type Props = {
  entityType: string;
};

export function InlineCustomFieldAdder(props: Props) {
  const auth = useAuth();
  const toast = useToast();
  const { fields, reload, upsertCustomField } = useFormFieldSettings(props.entityType);

  const [open, setOpen] = createSignal(false);
  const [newLabel, setNewLabel] = createSignal("");
  const [newKey, setNewKey] = createSignal("");
  const [newType, setNewType] = createSignal<CustomFieldType>("text");
  const [newRequired, setNewRequired] = createSignal(false);
  const [newChoices, setNewChoices] = createSignal("");
  const [adding, setAdding] = createSignal(false);

  const canEdit = () => canManageFormSettings(auth.me);

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
    setOpen(false);
    await reload();
  };

  return (
    <Show when={canEdit()}>
      <div class="col-span-full mt-2">
        <Show
          when={open()}
          fallback={
            <button
              type="button"
              class="text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline"
              onClick={() => setOpen(true)}
            >
              + Add custom field
            </button>
          }
        >
          <div class="rounded-lg border border-dashed border-brand-200 bg-brand-50/40 p-3">
            <div class="mb-2 flex items-center justify-between gap-2">
              <h4 class="text-sm font-semibold text-text-primary">New custom field</h4>
              <button
                type="button"
                class="text-xs text-text-secondary hover:text-text-primary"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
            </div>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Field label">
                <input
                  class={inputClass}
                  value={newLabel()}
                  onInput={(e) => setNewLabel(e.currentTarget.value)}
                  placeholder="e.g. Tax ID"
                />
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
              <label class="flex items-center gap-2 text-sm text-text-primary sm:col-span-2">
                <input type="checkbox" checked={newRequired()} onChange={(e) => setNewRequired(e.currentTarget.checked)} />
                Required field
              </label>
              <div class="sm:col-span-2">
                <button
                  type="button"
                  class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                  disabled={adding()}
                  onClick={() => void addCustomField()}
                >
                  Add field
                </button>
              </div>
            </div>
          </div>
        </Show>
      </div>
    </Show>
  );
}
