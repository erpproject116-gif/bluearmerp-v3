import { A } from "@solidjs/router";
import { createEffect, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../../shared/SpreadsheetGrid";
import { submitEntity } from "../../../shared/handleSaveResult";
import { useListState } from "../../../shared/useListState";
import { useToast } from "../../../shared/toast";
import { useAuth } from "../../../shared/auth-context";
import { PermissionMatrix, type AccessLevel, type MatrixValue } from "../../../shared/PermissionMatrix";
import {
  useInvalidateUserManagement,
  useTenantRoleList,
  useTenantUserList,
  type TenantUserRow,
} from "../../../shared/useUserManagement";
import {
  fetchUserGroups,
  saveUserGroups,
  saveUserPermissionOverrides,
  useInvalidatePermissions,
  usePermissionRegistry,
  useUserGroupList,
  useUserPermissions,
} from "../../../shared/usePermissions";

function statusLabel(status: string) {
  if (status === "invited") return "Invited";
  if (status === "disabled") return "Deleted";
  return "Active";
}

export default function UsersPage() {
  const auth = useAuth();
  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } =
    useListState("email");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [inviteOpen, setInviteOpen] = createSignal(false);
  const [editOpen, setEditOpen] = createSignal(false);
  const [permOpen, setPermOpen] = createSignal(false);
  const [previewOpen, setPreviewOpen] = createSignal(false);
  const [permUserId, setPermUserId] = createSignal<number | null>(null);
  const [previewUserId, setPreviewUserId] = createSignal<number | null>(null);
  const [permValues, setPermValues] = createSignal<Record<string, MatrixValue>>({});
  const [editing, setEditing] = createSignal<TenantUserRow | null>(null);
  const [inviteEmail, setInviteEmail] = createSignal("");
  const [inviteName, setInviteName] = createSignal("");
  const [inviteRole, setInviteRole] = createSignal("member");
  const [editRole, setEditRole] = createSignal("member");
  const [editStatus, setEditStatus] = createSignal("active");
  const [editName, setEditName] = createSignal("");
  const [editGroupIds, setEditGroupIds] = createSignal<number[]>([]);
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const invalidate = useInvalidateUserManagement();
  const permInvalidate = useInvalidatePermissions();
  const roles = useTenantRoleList();
  const groups = useUserGroupList();
  const registry = usePermissionRegistry();
  const userPerms = useUserPermissions(permUserId);
  const previewPerms = useUserPermissions(previewUserId);

  const list = useTenantUserList(() => ({
    page: page(),
    pageSize,
    sort: sort(),
    order: order(),
    q: q() || undefined,
    status: statusFilter() || undefined,
  }));

  const openInvite = () => {
    setInviteEmail("");
    setInviteName("");
    setInviteRole("member");
    setInviteOpen(true);
  };

  const openEdit = async (row: TenantUserRow) => {
    setEditing(row);
    setEditName(row.full_name ?? "");
    setEditRole(row.tenant_role);
    setEditStatus(row.status);
    setEditGroupIds([]);
    setEditOpen(true);
    const res = await fetchUserGroups(row.id);
    if (res.success && res.data?.group_ids) {
      setEditGroupIds(res.data.group_ids);
    }
  };

  const openOverrides = (row: TenantUserRow) => {
    if (row.is_owner) {
      toast.warning("Tenant owner has full access; overrides cannot be set.");
      return;
    }
    if (row.status === "disabled") {
      toast.warning("Restore this user before editing overrides.");
      return;
    }
    setPermUserId(row.id);
    setPermOpen(true);
  };

  const openEffectivePreview = (row: TenantUserRow) => {
    if (row.is_owner) {
      toast.warning("Tenant owner has full write access to all modules.");
      return;
    }
    setPreviewUserId(row.id);
    setPreviewOpen(true);
  };

  createEffect(() => {
    const data = userPerms.data;
    if (!permOpen() || !data) return;
    const next: Record<string, MatrixValue> = {};
    for (const [k, v] of Object.entries(data.overrides)) {
      next[k] = v as MatrixValue;
    }
    setPermValues(next);
  });

  const saveUserOverrides = async () => {
    const id = permUserId();
    if (id == null) return;
    setSaving(true);
    const overrides: Record<string, string> = {};
    for (const [k, v] of Object.entries(permValues())) {
      if (v !== "inherit") overrides[k] = v;
    }
    const res = await saveUserPermissionOverrides(id, overrides);
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not save overrides.");
      return;
    }
    setPermOpen(false);
    permInvalidate.user(id);
    toast.success("Overrides saved.");
  };

  const sendInvite = async () => {
    const email = inviteEmail().trim();
    const fullName = inviteName().trim();
    if (!email || !fullName) {
      toast.warning("Email and full name are required.");
      return;
    }
    setSaving(true);
    const ok = await submitEntity(
      () =>
        apiFetch<TenantUserRow>("/api/v1/user-management/invites", {
          method: "POST",
          body: JSON.stringify({
            email,
            full_name: fullName,
            tenant_role: inviteRole(),
          }),
        }, { silent: true }),
      toast,
      `User invited. Ask them to sign in at /signin with Google using ${email} (same address). They will join this company as a member—not start a separate trial.`,
    );
    setSaving(false);
    if (!ok) return;
    setInviteOpen(false);
    invalidate.all();
  };

  const saveEdit = async () => {
    const row = editing();
    if (!row) return;
    const fullName = editName().trim();
    if (!fullName) {
      toast.warning("Full name is required.");
      return;
    }
    setSaving(true);
    const ok = await submitEntity(
      () =>
        apiFetch(`/api/v1/user-management/users/${row.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            full_name: fullName,
            tenant_role: editRole(),
            status: editStatus(),
          }),
        }, { silent: true }),
      toast,
      "User updated.",
    );
    if (!ok) {
      setSaving(false);
      return;
    }
    if (!row.is_owner) {
      const groupRes = await saveUserGroups(row.id, editGroupIds());
      if (!groupRes.success) {
        toast.warning(groupRes.message ?? "User saved but groups could not be updated.");
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    setEditOpen(false);
    invalidate.all();
  };

  const softDelete = async (row: TenantUserRow) => {
    if (row.is_owner) {
      toast.warning("Cannot delete the tenant owner.");
      return;
    }
    if (row.id === auth.me?.user?.id) {
      toast.warning("You cannot delete your own account.");
      return;
    }
    if (
      !confirm(
        `Soft-delete ${row.full_name || row.email}? They lose access immediately. Role, groups, overrides, and data scopes are kept for restore.`,
      )
    ) {
      return;
    }
    const res = await apiFetch(
      `/api/v1/user-management/users/${row.id}`,
      { method: "PATCH", body: JSON.stringify({ status: "disabled" }) },
      { silent: true },
    );
    if (!res.ok) {
      toast.warning(res.message ?? "Could not delete user.");
      return;
    }
    toast.success("User deleted (access stopped). Restore anytime from the Deleted filter.");
    invalidate.all();
  };

  const restoreUser = async (row: TenantUserRow) => {
    const res = await apiFetch(
      `/api/v1/user-management/users/${row.id}`,
      { method: "PATCH", body: JSON.stringify({ status: "active" }) },
      { silent: true },
    );
    if (!res.ok) {
      toast.warning(res.message ?? "Could not restore user.");
      return;
    }
    toast.success("User restored with prior role, groups, and scopes.");
    invalidate.all();
  };

  const revokeInvite = async (row: TenantUserRow) => {
    if (!row.invite_id) return;
    if (!confirm(`Revoke invite for ${row.email}?`)) return;
    const res = await apiFetch(`/api/v1/user-management/invites/${row.invite_id}/revoke`, { method: "POST" }, {
      successMessage: "Invite revoked.",
    });
    if (res.success) {
      invalidate.all();
    } else {
      toast.warning(res.message ?? "Failed to revoke invite.");
    }
  };

  const rows = () => list.data?.rows ?? [];

  const previewEntries = () => {
    const eff = previewPerms.data?.effective ?? {};
    return Object.entries(eff)
      .filter(([, lvl]) => lvl && lvl !== "deny")
      .sort(([a], [b]) => a.localeCompare(b));
  };

  return (
    <div class="space-y-3">
      <p class="text-sm text-text-secondary">
        Invite people, assign a role (and optional groups), soft-delete/restore. Open{" "}
        <strong>Overrides</strong> only for exceptions. Limit customers/locations on{" "}
        <A href="/app/user-management/user-permissions" class="text-brand-600 hover:underline">
          Data scopes
        </A>
        .
      </p>
      <SpreadsheetGrid
        columns={[
          { key: "email", header: "Email", sortable: true },
          { key: "full_name", header: "Full name", sortable: true },
          {
            key: "tenant_role",
            header: "Role",
            render: (row) => (
              <span>
                {row.tenant_role}
                {row.is_owner ? " (Owner)" : ""}
              </span>
            ),
          },
          {
            key: "group_names",
            header: "Groups",
            render: (row) => <span class="text-xs text-text-secondary">{row.group_names || "—"}</span>,
          },
          {
            key: "status",
            header: "Status",
            render: (row) => (
              <Show
                when={row.status === "disabled"}
                fallback={<span>{statusLabel(row.status)}</span>}
              >
                <span class="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-800">Deleted</span>
              </Show>
            ),
          },
          {
            key: "auth_linked",
            header: "Google linked",
            render: (row) => <span>{row.auth_linked ? "Yes" : "No"}</span>,
          },
          {
            key: "actions",
            header: "Actions",
            render: (row) => (
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  class="text-sm text-brand-600 hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    void openEdit(row);
                  }}
                >
                  Edit
                </button>
                <Show when={row.status !== "invited" && !row.is_owner && row.status !== "disabled"}>
                  <button
                    type="button"
                    class="text-sm text-brand-600 hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      openOverrides(row);
                    }}
                  >
                    Overrides
                  </button>
                  <button
                    type="button"
                    class="text-sm text-brand-600 hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEffectivePreview(row);
                    }}
                  >
                    Effective access
                  </button>
                  <A
                    href="/app/user-management/user-permissions"
                    class="text-sm text-brand-600 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Data scopes
                  </A>
                </Show>
                <Show when={row.status === "active" && !row.is_owner}>
                  <button
                    type="button"
                    class="text-sm text-red-600 hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      void softDelete(row);
                    }}
                  >
                    Delete
                  </button>
                </Show>
                <Show when={row.status === "disabled"}>
                  <button
                    type="button"
                    class="text-sm text-emerald-700 hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      void restoreUser(row);
                    }}
                  >
                    Restore
                  </button>
                </Show>
                <Show when={row.status === "invited" && row.invite_id}>
                  <button
                    type="button"
                    class="text-sm text-red-600 hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      void revokeInvite(row);
                    }}
                  >
                    Revoke
                  </button>
                </Show>
              </div>
            ),
          },
        ]}
        rows={rows()}
        loading={list.isLoading}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={(row) => void openEdit(row)}
        onNew={openInvite}
        codeKey="email"
        nameKey="full_name"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        page={page()}
        pageSize={pageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        search={q()}
        onSearchChange={setQ}
        searchPlaceholder="Search email or name…"
        status={statusFilter()}
        onStatusChange={setStatusFilter}
        statusLabel="Status"
        statusOptions={[
          { value: "", label: "All" },
          { value: "active", label: "Active" },
          { value: "invited", label: "Invited" },
          { value: "disabled", label: "Deleted" },
        ]}
        onRefresh={() => invalidate.users()}
      />

      <EntityModal
        open={inviteOpen()}
        title="Invite user"
        onClose={() => setInviteOpen(false)}
        onSave={() => void sendInvite()}
        saving={saving()}
      >
        <Field label="Email *">
          <input
            type="email"
            class={inputClass}
            value={inviteEmail()}
            onInput={(e) => setInviteEmail(e.currentTarget.value)}
            placeholder="user@gmail.com"
          />
        </Field>
        <Field label="Full name *">
          <input class={inputClass} value={inviteName()} onInput={(e) => setInviteName(e.currentTarget.value)} />
        </Field>
        <Field label="Role *">
          <select class={inputClass} value={inviteRole()} onChange={(e) => setInviteRole(e.currentTarget.value)}>
            <For each={roles.data ?? []}>
              {(role) => (
                <option value={role.role_code} disabled={!role.is_active}>
                  {role.role_name}
                </option>
              )}
            </For>
          </select>
        </Field>
        <p class="text-xs text-text-secondary">
          The user must sign in with Google using this exact email address.
        </p>
      </EntityModal>

      <EntityModal
        open={editOpen()}
        title="Edit user"
        onClose={() => setEditOpen(false)}
        onSave={() => void saveEdit()}
        saving={saving()}
      >
        <Show when={editing()}>
          {(row) => (
            <>
              <Field label="Email">
                <input class={inputClass} value={row().email} readOnly />
              </Field>
              <Field label="Full name *">
                <input
                  class={inputClass}
                  value={editName()}
                  onInput={(e) => setEditName(e.currentTarget.value)}
                />
              </Field>
              <Field label="Role *">
                <select
                  class={inputClass}
                  value={editRole()}
                  disabled={row().is_owner}
                  onChange={(e) => setEditRole(e.currentTarget.value)}
                >
                  <For each={roles.data ?? []}>
                    {(role) => (
                      <option value={role.role_code} disabled={!role.is_active}>
                        {role.role_name}
                      </option>
                    )}
                  </For>
                </select>
              </Field>
              <Field label="Status *">
                <select
                  class={inputClass}
                  value={editStatus()}
                  disabled={row().is_owner || row().status === "invited"}
                  onChange={(e) => setEditStatus(e.currentTarget.value)}
                >
                  <option value="active">Active</option>
                  <option value="disabled">Deleted</option>
                  <Show when={row().status === "invited"}>
                    <option value="invited">Invited</option>
                  </Show>
                </select>
              </Field>
              <Show when={!row().is_owner}>
                <Field label="Groups">
                  <p class="mb-2 text-xs text-text-secondary">
                    Optional team packs that add permissions on top of the user’s role (highest level wins).
                  </p>
                  <div class="max-h-40 overflow-y-auto rounded-lg border border-stroke p-2">
                    <For each={groups.data ?? []}>
                      {(g) => (
                        <label class="flex cursor-pointer items-center gap-2 py-1 text-sm">
                          <input
                            type="checkbox"
                            checked={editGroupIds().includes(g.id)}
                            disabled={!g.is_active}
                            onChange={() =>
                              setEditGroupIds((ids) =>
                                ids.includes(g.id) ? ids.filter((x) => x !== g.id) : [...ids, g.id],
                              )
                            }
                          />
                          <span>{g.group_name}</span>
                        </label>
                      )}
                    </For>
                  </div>
                </Field>
              </Show>
            </>
          )}
        </Show>
      </EntityModal>

      <EntityModal
        open={permOpen()}
        title={`Exception overrides — ${userPerms.data?.full_name ?? "User"}`}
        onClose={() => setPermOpen(false)}
        onSave={() => void saveUserOverrides()}
        saving={saving()}
        wide
        singleColumn
      >
        <p class="mb-3 text-sm text-text-secondary">
          Rare exceptions on top of role <span class="font-medium">{userPerms.data?.tenant_role}</span>
          <Show when={(userPerms.data?.group_names?.length ?? 0) > 0}>
            {" "}and groups {(userPerms.data?.group_names ?? []).join(", ")}
          </Show>
          . Choose <strong>Role</strong> to inherit the effective default (role + groups). Prefer changing the role
          matrix when many people need the same access.
        </p>
        <PermissionMatrix
          groups={registry.data ?? []}
          values={permValues()}
          allowInherit
          roleDefaults={userPerms.data?.effective as Record<string, AccessLevel> | undefined}
          loading={registry.isLoading || userPerms.isLoading}
          title="Per-user overrides. Effective access is the highest from role, all groups, then these overrides."
          enabledModuleCodes={auth.me?.enabled_module_codes ?? null}
          onChange={(code, level) => setPermValues((prev) => ({ ...prev, [code]: level }))}
        />
      </EntityModal>

      <EntityModal
        open={previewOpen()}
        title={`Effective access — ${previewPerms.data?.full_name ?? "User"}`}
        onClose={() => setPreviewOpen(false)}
        onSave={() => setPreviewOpen(false)}
        saveLabel="Close"
        wide
        singleColumn
      >
        <p class="mb-3 text-sm text-text-secondary">
          Runtime matrix for role <strong>{previewPerms.data?.tenant_role}</strong>
          <Show when={(previewPerms.data?.group_names?.length ?? 0) > 0}>
            {" "}+ groups {(previewPerms.data?.group_names ?? []).join(", ")}
          </Show>
          , then overrides. Matches what the app enforces after sign-in.
        </p>
        <Show when={previewPerms.isLoading}>
          <p class="text-sm text-text-secondary">Loading…</p>
        </Show>
        <Show when={!previewPerms.isLoading}>
          <div class="max-h-96 overflow-y-auto rounded-lg border border-stroke">
            <table class="min-w-full text-left text-sm">
              <thead class="bg-slate-50 text-xs uppercase text-text-secondary">
                <tr>
                  <th class="px-3 py-2">Permission</th>
                  <th class="px-3 py-2">Level</th>
                </tr>
              </thead>
              <tbody>
                <For each={previewEntries()} fallback={<tr><td class="px-3 py-3 text-text-secondary" colspan={2}>No non-deny permissions.</td></tr>}>
                  {([code, lvl]) => (
                    <tr class="border-t border-stroke">
                      <td class="px-3 py-1.5 font-mono text-xs">{code}</td>
                      <td class="px-3 py-1.5 capitalize">{lvl}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </EntityModal>
    </div>
  );
}
