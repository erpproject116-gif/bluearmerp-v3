import { createMemo } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";
import { getActiveTenantId } from "./activeContext";
import { useAuth } from "./auth-context";

export type FormFieldSetting = {
  id?: number;
  field_key: string;
  kind: "standard" | "custom";
  label: string;
  placeholder?: string;
  field_type: string;
  options?: { choices?: string[]; is_visible?: boolean; placeholder?: string };
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
  options?: { choices?: string[]; is_visible?: boolean; placeholder?: string };
  is_required: boolean;
  sort_order: number;
  is_active: boolean;
};

export function settingsQueryKey(tenantId: number, entityType: string) {
  return ["form-field-settings", tenantId, entityType] as const;
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
    placeholder: def.options?.placeholder,
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
  tenantId: number,
  entityType: string,
  def: CustomFieldDefinition,
) {
  const row = definitionToFormField(def);
  client.setQueryData<SettingsResponse>(settingsQueryKey(tenantId, entityType), (prev) => {
    const fields = prev?.fields ?? [];
    const idx = fields.findIndex((f) => f.kind === "custom" && (f.id === def.id || f.field_key === def.field_key));
    if (idx >= 0) {
      const next = [...fields];
      next[idx] = { ...next[idx], ...row };
      return { ...prev, fields: next };
    }
    return { ...prev, fields: [...fields, row] };
  });
}

export function removeCustomFieldFromCache(
  client: ReturnType<typeof useQueryClient>,
  tenantId: number,
  entityType: string,
  id: number,
) {
  client.setQueryData<SettingsResponse>(settingsQueryKey(tenantId, entityType), (prev) => {
    if (!prev) return prev;
    return {
      ...prev,
      fields: prev.fields.filter((f) => !(f.kind === "custom" && f.id === id)),
    };
  });
}

export function useFormFieldSettings(entityType: string) {
  const auth = useAuth();
  const client = useQueryClient();
  const tenantId = () => auth.me?.tenant.id ?? getActiveTenantId() ?? 0;

  const query = createQuery(() => ({
    queryKey: settingsQueryKey(tenantId(), entityType),
    enabled: tenantId() > 0,
    queryFn: () => fetchFormFieldSettings(entityType),
    staleTime: 300_000,
    gcTime: 600_000,
    refetchOnMount: false,
  }));

  const fields = createMemo(() => query.data?.fields ?? []);
  const canManage = createMemo(() => Boolean(query.data?.can_manage));
  const byKey = createMemo(() => {
    const map: Record<string, FormFieldSetting> = {};
    // Prefer standard fields when a custom field reuses the same key.
    for (const f of fields()) {
      if (f.kind === "standard" || !map[f.field_key]) map[f.field_key] = f;
    }
    return map;
  });

  const activeCustomFields = createMemo(() =>
    fields().filter((f) => f.kind === "custom" && f.is_active && f.is_visible),
  );

  const requiredStandardFields = createMemo(() =>
    fields().filter((f) => f.kind === "standard" && f.is_visible && f.is_required && !f.is_disabled),
  );

  const invalidate = () =>
    void client.invalidateQueries({ queryKey: settingsQueryKey(tenantId(), entityType) });

  const reload = async () => {
    const data = await client.fetchQuery({
      queryKey: settingsQueryKey(tenantId(), entityType),
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
    upsertCustomField: (def: CustomFieldDefinition) =>
      upsertCustomFieldInCache(client, tenantId(), entityType, def),
    removeCustomFieldLocal: (id: number) => removeCustomFieldFromCache(client, tenantId(), entityType, id),
  };
}

export function fieldLabel(f: FormFieldSetting | undefined, fallback: string) {
  return f?.label?.trim() || fallback;
}

export function fieldPlaceholder(f: FormFieldSetting | undefined, fallback?: string) {
  const direct = f?.placeholder?.trim();
  if (direct) return direct;
  const fromOpts = f?.options?.placeholder?.trim();
  if (fromOpts) return fromOpts;
  return fallback?.trim() ?? "";
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

/** Fields that always have a UI/API default — never block save when empty. */
export const DEFAULTED_STATUS_FIELDS = new Set(["progress_status"]);

export function buildRequiredChecksForSave(
  settings: FormFieldSetting[],
  values: Record<string, unknown>,
  defaults: Record<string, unknown> = { progress_status: "unconfirmed" },
): { checks: { key: string; label: string }[]; values: Record<string, unknown> } {
  const merged: Record<string, unknown> = { ...values };
  for (const [key, fallback] of Object.entries(defaults)) {
    if (isMissingValue(merged[key])) merged[key] = fallback;
  }
  const checks = buildRequiredChecks(settings).filter((c) => {
    if (DEFAULTED_STATUS_FIELDS.has(c.key)) return false;
    return true;
  });
  return { checks, values: merged };
}

function isMissingValue(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return !v.trim();
  if (typeof v === "number") return !Number.isFinite(v) || v <= 0;
  return false;
}
