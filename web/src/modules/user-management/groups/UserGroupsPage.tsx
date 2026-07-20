import { createEffect, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../../shared/SpreadsheetGrid";
import { submitEntity } from "../../../shared/handleSaveResult";
import { useToast } from "../../../shared/toast";
import { useAuth } from "../../../shared/auth-context";
import { PermissionMatrix, type MatrixValue } from "../../../shared/PermissionMatrix";
import { useTenantUserList } from "../../../shared/useUserManagement";
import {
  saveGroupMembers,
  saveGroupPermissions,
  useGroupPermissions,
  useInvalidatePermissions,
  usePermissionRegistry,
  useUserGroupList,
  type UserGroupRow,
} from "../../../shared/usePermissions";

export default function UserGroupsPage() {
  const auth = useAuth();
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [permOpen, setPermOpen] = createSignal(false);
  const [membersOpen, setMembersOpen] = createSignal(false);
  const [permGroupId, setPermGroupId] = createSignal<number | null>(null);
  const [membersGroupId, setMembersGroupId] = createSignal<number | null>(null);
  const [permValues, setPermValues] = createSignal<Record<string, MatrixValue>>({});
  const [memberIds, setMemberIds] = createSignal<number[]>([]);
  const [editing, setEditing] = createSignal<UserGroupRow | null>(null);
  const [groupCode, setGroupCode] = createSignal("");
  const [groupName, setGroupName] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [isActive, setIsActive] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const permInvalidate = useInvalidatePermissions();
  const list = useUserGroupList();
  const registry = usePermissionRegistry();
  const groupPerms = useGroupPermissions(permGroupId);
  const users = useTenantUserList(() => ({ page: 1, pageSize: 500, sort: "full_name", order: "asc" }));

  createEffect(() => {
    const data = groupPerms.data?.permissions;
    if (!permOpen() || !data) return;
    const next: Record<string, MatrixValue> = {};
    for (const [k, v] of Object.entries(data)) next[k] = v as MatrixValue;
    setPermValues(next);
  });

  const openNew = () => {
    setEditing(null);
    setGroupCode("");
    setGroupName("");
    setDescription("");
    setIsActive(true);
    setModalOpen(true);
  };

  const openEdit = (row: UserGroupRow) => {
    setEditing(row);
    setGroupCode(row.group_code);
    setGroupName(row.group_name);
    setDescription(row.description ?? "");
    setIsActive(row.is_active);
    setModalOpen(true);
  };

  const openPermissions = (row: UserGroupRow) => {
    setPermGroupId(row.id);
    setPermOpen(true);
  };

  const openMembers = async (row: UserGroupRow) => {
    setMembersGroupId(row.id);
    const res = await apiFetch<{ id: number }[]>(`/api/v1/user-management/groups/${row.id}/members`);
    setMemberIds((res.data ?? []).map((m) => m.id));
    setMembersOpen(true);
  };

  const save = async () => {
    const name = groupName().trim();
    if (!name) {
      toast.warning("Group name is required.");
      return;
    }
    setSaving(true);
    const ed = editing();
    const ok = await submitEntity(
      () =>
        ed
          ? apiFetch(`/api/v1/user-management/groups/${ed.id}`, {
              method: "PATCH",
              body: JSON.stringify({
                group_name: name,
                description: description(),
                is_active: isActive(),
              }),
            }, { silent: true })
          : apiFetch("/api/v1/user-management/groups", {
              method: "POST",
              body: JSON.stringify({
                group_code: groupCode().trim() || undefined,
                group_name: name,
                description: description(),
              }),
            }, { silent: true }),
      toast,
      ed ? "Group updated." : "Group created.",
    );
    setSaving(false);
    if (!ok) return;
    setModalOpen(false);
    permInvalidate.groups();
  };

  const savePermissions = async () => {
    const id = permGroupId();
    if (id == null) return;
    setSaving(true);
    const payload: Record<string, string> = {};
    for (const [k, v] of Object.entries(permValues())) {
      if (v !== "inherit") payload[k] = v;
    }
    const res = await saveGroupPermissions(id, payload);
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not save permissions.");
      return;
    }
    setPermOpen(false);
    permInvalidate.group(id);
  };

  const saveMembers = async () => {
    const id = membersGroupId();
    if (id == null) return;
    setSaving(true);
    const res = await saveGroupMembers(id, memberIds());
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not save members.");
      return;
    }
    setMembersOpen(false);
    permInvalidate.groups();
  };

  const toggleMember = (userId: number) => {
    setMemberIds((ids) => (ids.includes(userId) ? ids.filter((x) => x !== userId) : [...ids, userId]));
  };

  return (
    <>
      <SpreadsheetGrid
        columns={[
          { key: "group_code", header: "Code" },
          { key: "group_name", header: "Name" },
          { key: "member_count", header: "Members", render: (r) => <span>{r.member_count ?? 0}</span> },
          { key: "is_active", header: "Active", render: (r) => <span>{r.is_active ? "Yes" : "No"}</span> },
          {
            key: "actions",
            header: "Actions",
            render: (row) => (
              <div class="flex flex-wrap gap-2">
                <button type="button" class="text-sm text-brand-600 hover:underline" onClick={() => openEdit(row)}>
                  Edit
                </button>
                <button type="button" class="text-sm text-brand-600 hover:underline" onClick={() => openPermissions(row)}>
                  Permissions
                </button>
                <button type="button" class="text-sm text-brand-600 hover:underline" onClick={() => void openMembers(row)}>
                  Members
                </button>
              </div>
            ),
          },
        ]}
        rows={list.data ?? []}
        loading={list.isLoading}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={openEdit}
        onNew={openNew}
        codeKey="group_code"
        nameKey="group_name"
        onRefresh={() => permInvalidate.groups()}
      />

      <EntityModal open={modalOpen()} title={editing() ? "Edit group" : "New group"} onClose={() => setModalOpen(false)} onSave={() => void save()} saving={saving()}>
        <Show when={!editing()}>
          <Field label="Group code">
            <input class={inputClass} value={groupCode()} onInput={(e) => setGroupCode(e.currentTarget.value)} />
          </Field>
        </Show>
        <Field label="Name *">
          <input class={inputClass} value={groupName()} onInput={(e) => setGroupName(e.currentTarget.value)} />
        </Field>
        <Field label="Description">
          <input class={inputClass} value={description()} onInput={(e) => setDescription(e.currentTarget.value)} />
        </Field>
        <Show when={editing()}>
          <Field label="Active">
            <label class="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isActive()} onChange={(e) => setIsActive(e.currentTarget.checked)} />
              Group is active
            </label>
          </Field>
        </Show>
      </EntityModal>

      <EntityModal open={permOpen()} title={`Group permissions — ${groupPerms.data?.group_name ?? ""}`} onClose={() => setPermOpen(false)} onSave={() => void savePermissions()} saving={saving()} wide singleColumn>
        <PermissionMatrix
          groups={registry.data ?? []}
          values={permValues()}
          loading={registry.isLoading || groupPerms.isLoading}
          title="Bulk permission template for this group (modules on under Module & Features). Members inherit the highest access from role and groups."
          enabledModuleCodes={auth.me?.enabled_module_codes ?? null}
          onChange={(code, level) => setPermValues((prev) => ({ ...prev, [code]: level }))}
        />
      </EntityModal>

      <EntityModal open={membersOpen()} title="Group members" onClose={() => setMembersOpen(false)} onSave={() => void saveMembers()} saving={saving()} wide singleColumn>
        <p class="mb-3 text-sm text-text-secondary">Users can belong to multiple groups. Permissions merge using the highest level granted.</p>
        <div class="max-h-96 overflow-y-auto rounded-lg border border-stroke p-3">
          <For each={users.data?.rows ?? []}>
            {(u) => (
              <label class="flex cursor-pointer items-center gap-2 border-b border-stroke/50 py-2 text-sm last:border-0">
                <input type="checkbox" checked={memberIds().includes(u.id)} onChange={() => toggleMember(u.id)} />
                <span>{u.full_name}</span>
                <span class="text-text-secondary">({u.email})</span>
              </label>
            )}
          </For>
        </div>
      </EntityModal>
    </>
  );
}
