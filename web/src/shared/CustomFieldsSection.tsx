import { For, Show } from "solid-js";
import { DateInput } from "./DateInput";
import { Field, inputClass } from "./SpreadsheetGrid";
import { useFormFieldSettings } from "./useFormFieldSettings";

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

type Props = {
  entityType: string;
  values: () => Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
};

export function CustomFieldsSection(props: Props) {
  const { activeCustomFields } = useFormFieldSettings(props.entityType);
  const defs = () => activeCustomFields();

  return (
    <Show when={defs().length > 0}>
      <div class="col-span-full mt-2 border-t border-stroke pt-4">
        <div class="mb-3">
          <h3 class="text-sm font-semibold text-text-primary">Custom fields</h3>
          <p class="text-xs text-text-secondary">Configured in Settings for this feature.</p>
        </div>
        <For each={defs()}>
          {(def) => (
            <CustomFieldInput
              def={def}
              value={() => props.values()[def.field_key]}
              onChange={props.onChange}
            />
          )}
        </For>
      </div>
    </Show>
  );
}

function CustomFieldInput(props: {
  def: { field_key: string; label: string; field_type: string; options?: { choices?: string[] }; is_required: boolean };
  value: () => unknown;
  onChange: (key: string, value: unknown) => void;
}) {
  const choices = () => props.def.options?.choices ?? [];
  const label = () => `${props.def.label}${props.def.is_required ? " *" : ""}`;

  return (
    <SwitchField def={props.def} label={label()} value={props.value()} onChange={props.onChange} choices={choices()} />
  );
}

function SwitchField(props: {
  def: { field_key: string; field_type: string };
  label: string;
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
          <input class={inputClass} value={String(props.value ?? "")} onInput={(e) => set(e.currentTarget.value)} />
        </Field>
      );
  }
}

export function validateCustomFields(
  values: Record<string, unknown>,
  defs: { field_key: string; label: string; is_required: boolean }[],
): string | null {
  const missing = defs
    .filter((d) => {
      if (!d.is_required) return false;
      const v = values[d.field_key];
      if (v == null) return true;
      if (typeof v === "string") return !v.trim();
      if (typeof v === "boolean") return false;
      return false;
    })
    .map((d) => d.label);
  if (missing.length === 0) return null;
  return `Please fill in required custom fields: ${missing.join(", ")}.`;
}
