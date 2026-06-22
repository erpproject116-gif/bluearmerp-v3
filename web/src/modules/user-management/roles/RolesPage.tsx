import { createSignal, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../../shared/SpreadsheetGrid";
import { submitEntity } from "../../../shared/handleSaveResult";
import { useToast } from "../../../shared/toast";
import {
  useInvalidateUserManagement,
  useTenantRoleList,
  type TenantRoleRow,
} from "../../../shared/useUserManagement";

export default function RolesPage() {
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<TenantRoleRow | null>(null);
  const [roleCode, setRoleCode] = createSignal("");
  const [roleName, setRoleName] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [canManageUsers, setCanManageUsers] = createSignal(false);
  const [canManageFormSettings, setCanManageFormSettings] = createSignal(false);
  const [isActive, setIsActive] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const invalidate = useInvalidateUserManagement();
  const list = useTenantRoleList();

  const openNew = () => {
    setEditing(null);
    setRoleCode("");
    setRoleName("");
    setDescription("");
    setCanManageUsers(false);
    setCanManageFormSettings(false);
    setIsActive(true);
    setModalOpen(true);
  };

  const openEdit = (row: TenantRoleRow) => {
    setEditing(row);
    setRoleCode(row.role_code);
    setRoleName(row.role_name);
    setDescription(row.description ?? "");
    setCanManageUsers(row.can_manage_users);
    setCanManageFormSettings(row.can_manage_form_settings);
    setIsActive(row.is_active);
    setModalOpen(true);
  };

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
                can_manage_users: canManageUsers(),
                can_manage_form_settings: canManageFormSettings(),
                is_active: isActive(),
              }),
            })
          : apiFetch("/api/v1/user-management/roles", {
              method: "POST",
              body: JSON.stringify({
                role_code: roleCode().trim() || undefined,
                role_name: name,
                description: description(),
                can_manage_users: canManageUsers(),
                can_manage_form_settings: canManageFormSettings(),
              }),
            }),
      toast,
      ed ? "Role updated." : "Role created.",
    );
    setSaving(false);
    if (!ok) return;
    setModalOpen(false);
    invalidate.all();
  };

  const rows = () => list.data ?? [];

  return (
    <>
      <SpreadsheetGrid
        columns={[
          { key: "role_code", header: "Code" },
          { key: "role_name", header: "Name" },
          {
            key: "can_manage_users",
            header: "Manage users",
            render: (row) => <span>{row.can_manage_users ? "Yes" : "No"}</span>,
          },
          {
            key: "can_manage_form_settings",
            header: "Form settings",
            render: (row) => <span>{row.can_manage_form_settings ? "Yes" : "No"}</span>,
          },
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
        <Show when={!editing()?.is_system}>
          <Field label="Permissions">
            <div class="space-y-2">
              <label class="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={canManageUsers()}
                  onChange={(e) => setCanManageUsers(e.currentTarget.checked)}
                />
                Can manage users
              </label>
              <label class="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={canManageFormSettings()}
                  onChange={(e) => setCanManageFormSettings(e.currentTarget.checked)}
                />
                Can manage form settings
              </label>
              <Show when={editing()}>
                <label class="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={isActive()} onChange={(e) => setIsActive(e.currentTarget.checked)} />
                  Active
                </label>
              </Show>
            </div>
          </Field>
        </Show>
        <Show when={editing()?.is_system}>
          <p class="text-xs text-text-secondary">System roles cannot change permission flags in this MVP.</p>
        </Show>
      </EntityModal>
    </>
  );
}
