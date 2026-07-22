import { createEffect, createSignal, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../../shared/SpreadsheetGrid";
import { submitEntity } from "../../../shared/handleSaveResult";
import { useToast } from "../../../shared/toast";
import { useAuth } from "../../../shared/auth-context";
import { PermissionMatrix, type MatrixValue } from "../../../shared/PermissionMatrix";
import {
  useInvalidateUserManagement,
  useTenantRoleList,
  type TenantRoleRow,
} from "../../../shared/useUserManagement";
import {
  saveRolePermissions,
  useInvalidatePermissions,
  usePermissionRegistry,
  useRolePermissions,
} from "../../../shared/usePermissions";

export default function RolesPage() {
  const auth = useAuth();
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [permModalOpen, setPermModalOpen] = createSignal(false);
  const [permRoleId, setPermRoleId] = createSignal<number | null>(null);
  const [permValues, setPermValues] = createSignal<Record<string, MatrixValue>>({});
  const [submitFlags, setSubmitFlags] = createSignal<Record<string, boolean>>({});
  const [cancelFlags, setCancelFlags] = createSignal<Record<string, boolean>>({});
  const [editing, setEditing] = createSignal<TenantRoleRow | null>(null);
  const [roleCode, setRoleCode] = createSignal("");
  const [roleName, setRoleName] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [isActive, setIsActive] = createSignal(true);
  const [applyUserScopes, setApplyUserScopes] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const invalidate = useInvalidateUserManagement();
  const permInvalidate = useInvalidatePermissions();
  const list = useTenantRoleList();
  const registry = usePermissionRegistry();
  const rolePerms = useRolePermissions(permRoleId);

  const openNew = () => {
    setEditing(null);
    setRoleCode("");
    setRoleName("");
    setDescription("");
    setIsActive(true);
    setApplyUserScopes(false);
    setModalOpen(true);
  };

  const openEdit = (row: TenantRoleRow) => {
    setEditing(row);
    setRoleCode(row.role_code);
    setRoleName(row.role_name);
    setDescription(row.description ?? "");
    setIsActive(row.is_active);
    setApplyUserScopes(row.apply_user_scopes ?? false);
    setModalOpen(true);
  };

  const openPermissions = (row: TenantRoleRow) => {
    setPermRoleId(row.id);
    setPermModalOpen(true);
  };

  createEffect(() => {
    const data = rolePerms.data?.permissions;
    if (!permModalOpen() || !data) return;
    const next: Record<string, MatrixValue> = {};
    for (const [k, v] of Object.entries(data)) {
      next[k] = v as MatrixValue;
    }
    setPermValues(next);
    setSubmitFlags(rolePerms.data?.can_submit ?? {});
    setCancelFlags(rolePerms.data?.can_cancel ?? {});
  });

  const save = async () => {
    const name = roleName().trim();
    if (!name) {
      toast.warning("Role name is required.");
      return;
    }
    setSaving(true);
    const ed = editing();
    const ok = await submitEntity(
      () =>
        ed
          ? apiFetch(`/api/v1/user-management/roles/${ed.id}`, {
              method: "PATCH",
              body: JSON.stringify({
                role_name: name,
                description: description(),
                is_active: isActive(),
                apply_user_scopes: applyUserScopes(),
              }),
            }, { silent: true })
          : apiFetch("/api/v1/user-management/roles", {
              method: "POST",
              body: JSON.stringify({
                role_code: roleCode().trim() || undefined,
                role_name: name,
                description: description(),
                apply_user_scopes: applyUserScopes(),
              }),
            }, { silent: true }),
      toast,
      ed ? "Role updated." : "Role created.",
    );
    setSaving(false);
    if (!ok) return;
    setModalOpen(false);
    invalidate.all();
  };

  const savePermissions = async () => {
    const id = permRoleId();
    if (id == null) return;
    setSaving(true);
    const payload: Record<string, string> = {};
    for (const [k, v] of Object.entries(permValues())) {
      if (v === "inherit") continue;
      payload[k] = v;
    }
    const res = await saveRolePermissions(id, payload, submitFlags(), cancelFlags());
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not save permissions.");
      return;
    }
    setPermModalOpen(false);
    permInvalidate.role(id);
  };

  const rows = () => list.data ?? [];

  return (
    <>
      <SpreadsheetGrid
        columns={[
          { key: "role_code", header: "Code" },
          { key: "role_name", header: "Name" },
          {
            key: "is_system",
            header: "System",
            render: (row) => <span>{row.is_system ? "Yes" : "No"}</span>,
          },
          {
            key: "is_active",
            header: "Active",
            render: (row) => <span>{row.is_active ? "Yes" : "No"}</span>,
          },
          {
            key: "user_count",
            header: "Users",
            render: (row) => <span>{row.user_count ?? 0}</span>,
          },
          {
            key: "actions",
            header: "Actions",
            render: (row) => (
              <div class="flex gap-2">
                <button
                  type="button"
                  class="text-sm text-brand-600 hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    openEdit(row);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  class="text-sm text-brand-600 hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    openPermissions(row);
                  }}
                >
                  Permissions
                </button>
              </div>
            ),
          },
        ]}
        rows={rows()}
        loading={list.isLoading}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={openEdit}
        onNew={openNew}
        codeKey="role_code"
        nameKey="role_name"
        onRefresh={() => invalidate.roles()}
      />

      <EntityModal
        open={modalOpen()}
        title={editing() ? "Edit role" : "New role"}
        onClose={() => setModalOpen(false)}
        onSave={() => void save()}
        saving={saving()}
      >
        <Show when={!editing()}>
          <Field label="Role code">
            <input
              class={inputClass}
              value={roleCode()}
              onInput={(e) => setRoleCode(e.currentTarget.value)}
              placeholder="Optional — auto-generated from name"
            />
          </Field>
        </Show>
        <Show when={editing()}>
          <Field label="Role code">
            <input class={inputClass} value={roleCode()} readOnly />
          </Field>
        </Show>
        <Field label="Name *">
          <input class={inputClass} value={roleName()} onInput={(e) => setRoleName(e.currentTarget.value)} />
        </Field>
        <Field label="Description">
          <input class={inputClass} value={description()} onInput={(e) => setDescription(e.currentTarget.value)} />
        </Field>
        <Field label="Apply user data scopes">
          <label class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={applyUserScopes()}
              onChange={(e) => setApplyUserScopes(e.currentTarget.checked)}
            />
            Restrict document lists to customers/locations assigned per user
          </label>
          <p class="mt-1 text-xs text-text-secondary">
            Leave off for company admins (for example seeded <code class="text-[11px]">store_admin</code>) who should
            see all branches. Turn on for branch-only staff, then assign locations under User permissions → Data scopes.
          </p>
          <Show when={applyUserScopes()}>
            <p class="mt-1 text-xs text-amber-700">
              Fail-closed: a user with this role sees <strong>no records</strong> until you assign them
              customers/locations under User permissions &rarr; Data scopes.
            </p>
          </Show>
        </Field>
        <Show when={editing()}>
          <Field label="Active">
            <label class="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isActive()} onChange={(e) => setIsActive(e.currentTarget.checked)} />
              Role is active
            </label>
          </Field>
        </Show>
        <p class="text-xs text-text-secondary">
          Use <strong>Permissions</strong> on the role row to set Read, Write, or D/A for each module and feature.
        </p>
      </EntityModal>

      <EntityModal
        open={permModalOpen()}
        title={`Permissions — ${rolePerms.data?.role_name ?? "Role"}`}
        onClose={() => setPermModalOpen(false)}
        onSave={() => void savePermissions()}
        saving={saving()}
        wide
        singleColumn
      >
        <PermissionMatrix
          groups={registry.data ?? []}
          values={permValues()}
          loading={registry.isLoading || rolePerms.isLoading}
          title="Defaults for this role (modules turned on under Module & Features). Users also inherit from groups."
          enabledModuleCodes={auth.me?.enabled_module_codes ?? null}
          onChange={(code, level) => setPermValues((prev) => ({ ...prev, [code]: level }))}
          submitFlags={submitFlags()}
          cancelFlags={cancelFlags()}
          onSubmitChange={(code, enabled) => setSubmitFlags((prev) => ({ ...prev, [code]: enabled }))}
          onCancelChange={(code, enabled) => setCancelFlags((prev) => ({ ...prev, [code]: enabled }))}
        />
      </EntityModal>
    </>
  );
}
