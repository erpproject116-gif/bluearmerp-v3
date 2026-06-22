import { createMemo } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type FormFieldSetting = {
  id?: number;
  field_key: string;
  kind: "standard" | "custom";
  label: string;
  field_type: string;
  options?: { choices?: string[] };
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

export function useFormFieldSettings(entityType: string) {
  const client = useQueryClient();
  const query = createQuery(() => ({
    queryKey: ["form-field-settings", entityType],
    queryFn: async () => {
      const res = await apiFetch<SettingsResponse>(
        `/api/v1/form-field-settings?entity_type=${encodeURIComponent(entityType)}`,
      );
      if (!res.success) throw new Error(res.message ?? "Failed to load form settings");
      return res.data ?? { fields: [] };
    },
    staleTime: 30_000,
  }));

  const fields = () => query.data?.fields ?? [];
  const canManage = () => Boolean(query.data?.can_manage);
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

  const invalidate = () => void client.invalidateQueries({ queryKey: ["form-field-settings", entityType] });

  return { query, fields, byKey, canManage, activeCustomFields, requiredStandardFields, invalidate };
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
