import { createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../../shared/SpreadsheetGrid";
import { submitEntity } from "../../../shared/handleSaveResult";
import { useListState } from "../../../shared/useListState";
import { useToast } from "../../../shared/toast";
import {
  useInvalidateUserManagement,
  useTenantRoleList,
  useTenantUserList,
  type TenantUserRow,
} from "../../../shared/useUserManagement";

function statusLabel(status: string) {
  if (status === "invited") return "Invited";
  if (status === "disabled") return "Disabled";
  return "Active";
}

export default function UsersPage() {
  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } =
    useListState("email");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [inviteOpen, setInviteOpen] = createSignal(false);
  const [editOpen, setEditOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<TenantUserRow | null>(null);
  const [inviteEmail, setInviteEmail] = createSignal("");
  const [inviteName, setInviteName] = createSignal("");
  const [inviteRole, setInviteRole] = createSignal("member");
  const [editRole, setEditRole] = createSignal("member");
  const [editStatus, setEditStatus] = createSignal("active");
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const invalidate = useInvalidateUserManagement();
  const roles = useTenantRoleList();

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

  const openEdit = (row: TenantUserRow) => {
    setEditing(row);
    setEditRole(row.tenant_role);
    setEditStatus(row.status);
    setEditOpen(true);
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
        }),
      toast,
      `User invited. They must sign in with Google using ${email}.`,
    );
    setSaving(false);
    if (!ok) return;
    setInviteOpen(false);
    invalidate.all();
  };

  const saveEdit = async () => {
    const row = editing();
    if (!row) return;
    setSaving(true);
    const ok = await submitEntity(
      () =>
        apiFetch(`/api/v1/user-management/users/${row.id}`, {
          method: "PATCH",
          body: JSON.stringify({ tenant_role: editRole(), status: editStatus() }),
        }),
      toast,
      "User updated.",
    );
    setSaving(false);
    if (!ok) return;
    setEditOpen(false);
    invalidate.all();
  };

  const revokeInvite = async (row: TenantUserRow) => {
    if (!row.invite_id) return;
    if (!confirm(`Revoke invite for ${row.email}?`)) return;
    const res = await apiFetch(`/api/v1/user-management/invites/${row.invite_id}/revoke`, { method: "POST" });
    if (res.success) {
      toast.success("Invite revoked.");
      invalidate.all();
    } else {
      toast.warning(res.message ?? "Failed to revoke invite.");
    }
  };

  const rows = () => list.data?.rows ?? [];

  return (
    <>
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
            key: "status",
            header: "Status",
            render: (row) => <span>{statusLabel(row.status)}</span>,
          },
          {
            key: "auth_linked",
            header: "Google linked",
            render: (row) => <span>{row.auth_linked ? "Yes" : "No"}</span>,
          },
          {
            key: "invited_at",
            header: "Invited",
            render: (row) => (
              <span>{row.invited_at ? new Date(row.invited_at).toLocaleDateString() : "—"}</span>
            ),
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
        onEdit={openEdit}
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
          { value: "disabled", label: "Disabled" },
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
                  <option value="disabled">Disabled</option>
                  <Show when={row().status === "invited"}>
                    <option value="invited">Invited</option>
                  </Show>
                </select>
              </Field>
            </>
          )}
        </Show>
      </EntityModal>
    </>
  );
}
