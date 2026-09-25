import { createEffect, createSignal, For, Show } from "solid-js";
import { apiFetch, type ApiResult } from "../../../shared/api";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../../shared/SpreadsheetGrid";
import { handleSaveResult, submitEntity } from "../../../shared/handleSaveResult";
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
  const [copyFromRoleCode, setCopyFromRoleCode] = createSignal("");
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
    setCopyFromRoleCode("");
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
    if (ed) {
      const ok = await submitEntity(
        () =>
          apiFetch(`/api/v1/user-management/roles/${ed.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              role_name: name,
              description: description(),
              is_active: isActive(),
              apply_user_scopes: applyUserScopes(),
            }),
          }, { silent: true }),
        toast,
        "Role updated.",
      );
      setSaving(false);
      if (!ok) return;
      setModalOpen(false);
      invalidate.all();
      return;
    }

    // New role: create (optionally copying another role), then open its Permissions right away.
    const copyFrom = copyFromRoleCode().trim();
    let res: ApiResult<TenantRoleRow>;
    try {
      res = await apiFetch<TenantRoleRow>("/api/v1/user-management/roles", {
        method: "POST",
        body: JSON.stringify({
          role_code: roleCode().trim() || undefined,
          role_name: name,
          description: description(),
          apply_user_scopes: applyUserScopes(),
          copy_from_role_code: copyFrom || undefined,
        }),
      }, { silent: true });
    } catch {
      setSaving(false);
      toast.error("Could not reach the server. Check your connection and try again.");
      return;
    }
    setSaving(false);
    const ok = handleSaveResult(res, toast, copyFrom ? "Role created from the selected role. Adjust its permissions." : "Role created. Set its permissions.");
    if (!ok) return;
    setModalOpen(false);
    invalidate.all();
    const created = res.data;
    if (created?.id) {
      openPermissions(created);
    }
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
      <p class="mb-3 text-sm text-text-secondary">
        Job templates. Edit the permission matrix for everyone with this role. Start from a role that is close, then adjust.
      </p>
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
            key: "apply_user_scopes",
            header: "Uses data scopes",
            render: (row) => <span>{row.apply_user_scopes ? "Yes" : "No"}</span>,
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
          <Field label="Start from">
            <select
              class={inputClass}
              value={copyFromRoleCode()}
              onChange={(e) => setCopyFromRoleCode(e.currentTarget.value)}
              aria-label="Start from an existing role"
            >
              <option value="">Blank (everything D/A)</option>
              <For each={rows().filter((r) => r.is_active)}>
                {(r) => (
                  <option value={r.role_code}>
                    {r.role_name}
                  </option>
                )}
              </For>
            </select>
            <p class="mt-1 text-xs text-text-secondary">
              Copies that role’s Read/Write/D/A, Submit, and Cancel. You can change any of it next.
            </p>
          </Field>
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
            This role uses Data scopes (limit which customers/locations the user can see)
          </label>
          <p class="mt-1 text-xs text-text-secondary">
            Leave off for company admins who should see all branches. Turn on for branch-only staff, then assign
            customers/locations under{" "}
            <span class="font-medium">User Management → Data scopes</span>.
          </p>
          <Show when={applyUserScopes()}>
            <p class="mt-1 text-xs text-amber-700">
              Fail-closed: a user with this role sees <strong>no records</strong> until you assign them
              customers/locations under Data scopes.
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
          <Show when={!editing()} fallback={<>Use <strong>Permissions</strong> on the role row to set Read, Write, or D/A for each module and feature.</>}>
            After you save, the <strong>Permissions</strong> matrix opens so you can set Read, Write, or D/A for each module and feature.
          </Show>
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
