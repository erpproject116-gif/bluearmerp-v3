import { For, Show, createSignal } from "solid-js";
import { DateInput } from "./DateInput";
import { Field, inputClass } from "./SpreadsheetGrid";
import { InlineCustomFieldAdder } from "./InlineCustomFieldAdder";
import { useFormFieldSettings, type FormFieldSetting } from "./useFormFieldSettings";
import { apiFetch } from "./api";
import { useToast } from "./toast";

export const FIELD_TYPES = [
  { value: "text", label: "Text box" },
  { value: "textarea", label: "Text area" },
  { value: "number", label: "Number" },
  { value: "select", label: "Dropdown" },
  { value: "radio", label: "Radio buttons" },
  { value: "checkbox", label: "Checkbox" },
  { value: "date", label: "Date picker" },
  { value: "date_range", label: "Date range" },
  { value: "number_range", label: "Number range" },
] as const;

export type CustomFieldType = (typeof FIELD_TYPES)[number]["value"];

export function isCustomFieldType(value: string): value is CustomFieldType {
  return FIELD_TYPES.some((t) => t.value === value);
}

type Props = {
  entityType: string;
  values: () => Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  /** Hide fields that match this predicate (e.g. personal birthday on Quotation). */
  excludeDef?: (def: { field_key: string; label: string }) => boolean;
};

/** Personal birthday / DOB fields do not belong on selling documents (quotation → sales). */
export function isPersonalBirthdayCustomField(def: { field_key: string; label: string }): boolean {
  const key = def.field_key.trim().toLowerCase();
  const label = def.label.trim().toLowerCase();
  const haystack = `${key} ${label}`;
  return (
    /\bbirth\s*day\b/.test(haystack) ||
    /\bbirthday\b/.test(haystack) ||
    /\bbirth\s*date\b/.test(haystack) ||
    /\bbirthdate\b/.test(haystack) ||
    /\bdate\s*of\s*birth\b/.test(haystack) ||
    /(^|_)dob($|_)/.test(key) ||
    label === "dob"
  );
}

export function CustomFieldsSection(props: Props) {
  const toast = useToast();
  const { activeCustomFields, canManage, removeCustomFieldLocal, reload } = useFormFieldSettings(props.entityType);
  const [removingId, setRemovingId] = createSignal<number | null>(null);

  const defs = () => {
    const all = activeCustomFields();
    const exclude = props.excludeDef;
    return exclude ? all.filter((d) => !exclude(d)) : all;
  };

  const removeField = async (def: FormFieldSetting) => {
    if (!def.id) {
      toast.error(`Cannot remove "${def.label}" — missing field id. Refresh and try again.`);
      return;
    }
    if (!window.confirm(`Remove custom field "${def.label}"?`)) return;
    setRemovingId(def.id);
    const res = await apiFetch(`/api/v1/custom-fields/${def.id}`, { method: "DELETE" }, {
      successMessage: `Custom field "${def.label}" removed.`,
    });
    setRemovingId(null);
    if (!res.success) {
      toast.error(res.message ?? "Failed to remove custom field.");
      return;
    }
    removeCustomFieldLocal(def.id);
    props.onChange(def.field_key, undefined);
    await reload();
  };

  return (
    <Show when={defs().length > 0 || canManage()}>
      <div class="col-span-full mt-2 border-t border-stroke pt-4">
        <div class="mb-3">
          <h3 class="text-sm font-semibold text-text-primary">Custom fields</h3>
          <p class="text-xs text-text-secondary">
            {canManage()
              ? "Add or remove fields here, or manage all form settings from Settings."
              : "Configured in Settings for this feature."}
          </p>
        </div>
        <div class="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
          <For each={defs()}>
            {(def) => (
              <div class="relative">
                <Show when={canManage() && def.id}>
                  <button
                    type="button"
                    class="absolute right-0 top-0 z-10 text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                    disabled={removingId() === def.id}
                    onClick={() => void removeField(def)}
                  >
                    Remove
                  </button>
                </Show>
                <CustomFieldInput
                  def={def}
                  value={() => props.values()[def.field_key]}
                  onChange={props.onChange}
                />
              </div>
            )}
          </For>
        </div>
        <InlineCustomFieldAdder entityType={props.entityType} />
      </div>
    </Show>
  );
}

function CustomFieldInput(props: {
  def: { field_key: string; label: string; field_type: string; options?: { choices?: string[]; placeholder?: string }; is_required: boolean };
  value: () => unknown;
  onChange: (key: string, value: unknown) => void;
}) {
  const choices = () => props.def.options?.choices ?? [];
  const placeholder = () => props.def.options?.placeholder ?? "";
  const label = () => `${props.def.label}${props.def.is_required ? " *" : ""}`;

  return (
    <SwitchField def={props.def} label={label()} placeholder={placeholder()} value={props.value()} onChange={props.onChange} choices={choices()} />
  );
}

function SwitchField(props: {
  def: { field_key: string; field_type: string };
  label: string;
  placeholder?: string;
  value: unknown;
  choices: string[];
  onChange: (key: string, value: unknown) => void;
}) {
  const set = (v: unknown) => props.onChange(props.def.field_key, v);

  switch (props.def.field_type) {
    case "textarea":
      return (
        <Field label={props.label} span="full">
          <textarea
            class={inputClass}
            rows={2}
            value={String(props.value ?? "")}
            onInput={(e) => set(e.currentTarget.value)}
          />
        </Field>
      );
    case "number":
      return (
        <Field label={props.label}>
          <input
            type="number"
            class={inputClass}
            value={props.value === undefined || props.value === null ? "" : String(props.value)}
            onInput={(e) => set(e.currentTarget.value === "" ? null : Number(e.currentTarget.value))}
          />
        </Field>
      );
    case "select":
      return (
        <Field label={props.label}>
          <select class={inputClass} value={String(props.value ?? "")} onChange={(e) => set(e.currentTarget.value)}>
            <option value="">—</option>
            <For each={props.choices}>{(c) => <option value={c}>{c}</option>}</For>
          </select>
        </Field>
      );
    case "radio":
      return (
        <Field label={props.label}>
          <div class="flex flex-wrap gap-3 pt-1">
            <For each={props.choices}>
              {(c) => (
                <label class="flex items-center gap-1.5 text-sm">
                  <input type="radio" name={props.def.field_key} checked={props.value === c} onChange={() => set(c)} />
                  {c}
                </label>
              )}
            </For>
          </div>
        </Field>
      );
    case "checkbox":
      return (
        <Field label={props.label}>
          <label class="flex items-center gap-2 pt-1 text-sm">
            <input type="checkbox" checked={Boolean(props.value)} onChange={(e) => set(e.currentTarget.checked)} />
            Yes
          </label>
        </Field>
      );
    case "date":
      return (
        <Field label={props.label}>
          <DateInput
            value={String(props.value ?? "")}
            onInput={(e) => set(e.currentTarget.value)}
          />
        </Field>
      );
    case "date_range": {
      const range = (props.value as { start?: string; end?: string }) ?? {};
      return (
        <Field label={props.label} span="full">
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <DateInput
              value={range.start ?? ""}
              onInput={(e) => set({ ...range, start: e.currentTarget.value })}
            />
            <DateInput
              value={range.end ?? ""}
              onInput={(e) => set({ ...range, end: e.currentTarget.value })}
            />
          </div>
        </Field>
      );
    }
    case "number_range": {
      const range = (props.value as { min?: number; max?: number }) ?? {};
      return (
        <Field label={props.label} span="full">
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              type="number"
              class={inputClass}
              placeholder="Min"
              value={range.min ?? ""}
              onInput={(e) => set({ ...range, min: e.currentTarget.value === "" ? undefined : Number(e.currentTarget.value) })}
            />
            <input
              type="number"
              class={inputClass}
              placeholder="Max"
              value={range.max ?? ""}
              onInput={(e) => set({ ...range, max: e.currentTarget.value === "" ? undefined : Number(e.currentTarget.value) })}
            />
          </div>
        </Field>
      );
    }
    default:
      return (
        <Field label={props.label}>
          <input
            class={inputClass}
            placeholder={props.placeholder}
            value={String(props.value ?? "")}
            onInput={(e) => set(e.currentTarget.value)}
          />
        </Field>
      );
  }
}

export function validateCustomFields(
  values: Record<string, unknown>,
  defs: { field_key: string; label: string; is_required: boolean }[],
): string | null {
  const errors = collectCustomFieldErrors(values, defs);
  const messages = Object.values(errors).filter(Boolean) as string[];
  if (messages.length === 0) return null;
  return messages.length === 1 ? messages[0]! : `Please fill in required custom fields: ${messages.join(", ")}.`;
}

export function collectCustomFieldErrors(
  values: Record<string, unknown>,
  defs: { field_key: string; label: string; is_required: boolean }[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const d of defs) {
    if (!d.is_required) continue;
    const v = values[d.field_key];
    if (v == null) {
      errors[d.field_key] = `${d.label} is required.`;
      continue;
    }
    if (typeof v === "string" && !v.trim()) {
      errors[d.field_key] = `${d.label} is required.`;
    }
  }
  return errors;
}
