import { createMemo } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type FormFieldSetting = {
  id?: number;
  field_key: string;
  kind: "standard" | "custom";
  label: string;
  field_type: string;
  options?: { choices?: string[]; is_visible?: boolean };
  is_visible: boolean;
  is_required: boolean;
  is_disabled: boolean;
  is_active: boolean;
  sort_order: number;
};

type SettingsResponse = {
  fields: FormFieldSetting[];
  can_manage?: boolean;
};

export type CustomFieldDefinition = {
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

export function settingsQueryKey(entityType: string) {
  return ["form-field-settings", entityType] as const;
}

async function fetchFormFieldSettings(entityType: string): Promise<SettingsResponse> {
  const res = await apiFetch<SettingsResponse>(
    `/api/v1/form-field-settings?entity_type=${encodeURIComponent(entityType)}`,
  );
  if (!res.success) throw new Error(res.message ?? "Failed to load form settings");
  return res.data ?? { fields: [] };
}

export function definitionToFormField(def: CustomFieldDefinition): FormFieldSetting {
  const visible = def.options?.is_visible;
  return {
    id: def.id,
    field_key: def.field_key,
    kind: "custom",
    label: def.label,
    field_type: def.field_type,
    options: def.options,
    is_visible: visible === undefined ? true : Boolean(visible),
    is_required: def.is_required,
    is_disabled: false,
    is_active: def.is_active,
    sort_order: def.sort_order + 1000,
  };
}

export function upsertCustomFieldInCache(
  client: ReturnType<typeof useQueryClient>,
  entityType: string,
  def: CustomFieldDefinition,
) {
  const row = definitionToFormField(def);
  client.setQueryData<SettingsResponse>(settingsQueryKey(entityType), (prev) => {
    const fields = prev?.fields ?? [];
    const idx = fields.findIndex((f) => f.kind === "custom" && f.id === def.id);
    if (idx >= 0) {
      const next = [...fields];
      next[idx] = { ...next[idx], ...row };
      return { ...prev, fields: next };
    }
    return { ...prev, fields: [...fields, row] };
  });
}

export function useFormFieldSettings(entityType: string) {
  const client = useQueryClient();
  const query = createQuery(() => ({
    queryKey: settingsQueryKey(entityType),
    queryFn: () => fetchFormFieldSettings(entityType),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  }));

  const fields = createMemo(() => query.data?.fields ?? []);
  const canManage = createMemo(() => Boolean(query.data?.can_manage));
  const byKey = createMemo(() => {
    const map: Record<string, FormFieldSetting> = {};
    for (const f of fields()) map[f.field_key] = f;
    return map;
  });

  const activeCustomFields = createMemo(() =>
    fields().filter((f) => f.kind === "custom" && f.is_active && f.is_visible),
  );

  const requiredStandardFields = createMemo(() =>
    fields().filter((f) => f.kind === "standard" && f.is_visible && f.is_required && !f.is_disabled),
  );

  const invalidate = () => void client.invalidateQueries({ queryKey: settingsQueryKey(entityType) });

  const reload = async () => {
    const data = await client.fetchQuery({
      queryKey: settingsQueryKey(entityType),
      queryFn: () => fetchFormFieldSettings(entityType),
      staleTime: 0,
    });
    return data;
  };

  return {
    query,
    fields,
    byKey,
    canManage,
    activeCustomFields,
    requiredStandardFields,
    invalidate,
    reload,
    upsertCustomField: (def: CustomFieldDefinition) => upsertCustomFieldInCache(client, entityType, def),
  };
}

export function fieldLabel(f: FormFieldSetting | undefined, fallback: string) {
  return f?.label?.trim() || fallback;
}

export function fieldVisible(f: FormFieldSetting | undefined, defaultVisible = true) {
  if (!f) return defaultVisible;
  return f.is_visible;
}

export function fieldRequired(f: FormFieldSetting | undefined, defaultRequired = false) {
  if (!f) return defaultRequired;
  return f.is_required;
}

export function fieldDisabled(f: FormFieldSetting | undefined) {
  return Boolean(f?.is_disabled);
}

export function labelWithRequired(label: string, required: boolean) {
  return required ? `${label} *` : label;
}

export function buildRequiredChecks(settings: FormFieldSetting[]): { key: string; label: string }[] {
  return settings
    .filter((f) => f.kind === "standard" && f.is_visible && f.is_required && !f.is_disabled)
    .map((f) => ({ key: f.field_key, label: f.label }));
}
