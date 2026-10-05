import { A, useNavigate } from "@solidjs/router";
import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { apiFetch } from "../../../shared/api";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../../shared/SpreadsheetGrid";
import { submitEntity } from "../../../shared/handleSaveResult";
import { useListState } from "../../../shared/useListState";
import { useToast } from "../../../shared/toast";
import { useAuth, PLATFORM_CONSOLE_EMAILS } from "../../../shared/auth-context";
import { PermissionMatrix, type AccessLevel, type MatrixValue } from "../../../shared/PermissionMatrix";
import {
  useInvalidateUserManagement,
  useTenantRoleList,
  useTenantUserList,
  type TenantUserRow,
} from "../../../shared/useUserManagement";
import {
  fetchUserDataScopes,
  saveUserDataScopes,
  saveUserPermissionOverrides,
  useInvalidatePermissions,
  usePermissionRegistry,
  useUserPermissions,
  type UserDataScope,
} from "../../../shared/usePermissions";

type RowMenuPos = { top: number; left: number };
type LocOpt = { id: number; label: string };

export default function UsersPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize, setPageSize } =
    useListState("email", 25, { defaultStatus: "active_pending" });
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [menuOpenId, setMenuOpenId] = createSignal<number | null>(null);
  const [menuPos, setMenuPos] = createSignal<RowMenuPos | null>(null);
  const [menuRow, setMenuRow] = createSignal<TenantUserRow | null>(null);

  const closeRowMenu = () => {
    setMenuOpenId(null);
    setMenuPos(null);
    setMenuRow(null);
  };

  const openRowMenu = (row: TenantUserRow, anchor: HTMLElement) => {
    if (menuOpenId() === row.id) {
      closeRowMenu();
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const menuWidth = 208;
    const left = Math.min(Math.max(8, rect.right - menuWidth), window.innerWidth - menuWidth - 8);
    setMenuPos({ top: rect.bottom + 4, left });
    setMenuRow(row);
    setMenuOpenId(row.id);
  };
  const [inviteOpen, setInviteOpen] = createSignal(false);
  const [editOpen, setEditOpen] = createSignal(false);
  const [accessOpen, setAccessOpen] = createSignal(false);
  const [permOpen, setPermOpen] = createSignal(false);
  const [previewOpen, setPreviewOpen] = createSignal(false);
  const [permUserId, setPermUserId] = createSignal<number | null>(null);
  const [previewUserId, setPreviewUserId] = createSignal<number | null>(null);
  const [permValues, setPermValues] = createSignal<Record<string, MatrixValue>>({});
  const [editing, setEditing] = createSignal<TenantUserRow | null>(null);
  const [accessUser, setAccessUser] = createSignal<TenantUserRow | null>(null);
  const [inviteEmail, setInviteEmail] = createSignal("");
  const [inviteName, setInviteName] = createSignal("");
  const [inviteRole, setInviteRole] = createSignal("member");
  const [inviteBranchIds, setInviteBranchIds] = createSignal<number[]>([]);
  const [inviteHomeId, setInviteHomeId] = createSignal<number | null>(null);
  const [editRole, setEditRole] = createSignal("member");
  const [editStatus, setEditStatus] = createSignal("active");
  const [editName, setEditName] = createSignal("");
  const [accessRole, setAccessRole] = createSignal("member");
  const [accessBranchIds, setAccessBranchIds] = createSignal<number[]>([]);
  const [accessHomeId, setAccessHomeId] = createSignal<number | null>(null);
  const [accessCustomerScopes, setAccessCustomerScopes] = createSignal<UserDataScope[]>([]);
  const [accessLoading, setAccessLoading] = createSignal(false);
  const [locations, setLocations] = createSignal<LocOpt[]>([]);
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const invalidate = useInvalidateUserManagement();
  const permInvalidate = useInvalidatePermissions();
  const roles = useTenantRoleList();
  const registry = usePermissionRegistry();
  const userPerms = useUserPermissions(permUserId);
  const previewPerms = useUserPermissions(previewUserId);

  onMount(() => {
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-user-row-menu]")) closeRowMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRowMenu();
    };
    const onScrollOrResize = () => {
      if (menuOpenId() != null) closeRowMenu();
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onScrollOrResize);
    // Capture scroll from table overflow containers so the fixed menu does not float detached.
    document.addEventListener("scroll", onScrollOrResize, true);
    onCleanup(() => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onScrollOrResize);
      document.removeEventListener("scroll", onScrollOrResize, true);
    });
  });

  const list = useTenantUserList(() => ({
    page: page(),
    pageSize: pageSize(),
    sort: sort(),
    order: order(),
    q: q() || undefined,
    status: statusFilter() || undefined,
  }));

  const loadLocations = async () => {
    if (locations().length > 0) return;
    const res = await apiFetch<Array<{ id: number; location_name: string }>>(
      "/api/v1/inventory/locations?pageSize=500",
    );
    setLocations((res.data ?? []).map((l) => ({ id: l.id, label: l.location_name })));
  };

  const roleAppliesScopes = (roleCode: string) =>
    Boolean((roles.data ?? []).find((r) => r.role_code === roleCode)?.apply_user_scopes);

  const toggleBranchId = (ids: number[], id: number, checked: boolean) => {
    if (checked) return ids.includes(id) ? ids : [...ids, id];
    return ids.filter((x) => x !== id);
  };

  const openInvite = () => {
    setInviteEmail("");
    setInviteName("");
    setInviteRole("member");
    setInviteBranchIds([]);
    setInviteHomeId(null);
    void loadLocations();
    setInviteOpen(true);
  };

  const openEdit = (row: TenantUserRow) => {
    setEditing(row);
    setEditName(row.full_name ?? "");
    setEditRole(row.tenant_role);
    setEditStatus(row.status);
    setEditOpen(true);
  };

  const openAccess = async (row: TenantUserRow) => {
    if (row.is_owner) {
      toast.warning("Company owner has full access; use Active branch in the sidebar to filter your own view.");
      return;
    }
    if (row.status === "disabled") {
      toast.warning("Restore this user before editing access.");
      return;
    }
    setAccessUser(row);
    setAccessRole(row.tenant_role);
    setAccessHomeId(row.home_location_id ?? null);
    setAccessBranchIds([]);
    setAccessCustomerScopes([]);
    setAccessOpen(true);
    setAccessLoading(true);
    await loadLocations();
    const res = await fetchUserDataScopes(row.id);
    setAccessLoading(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to load branches.");
      return;
    }
    const scopes = res.data ?? [];
    setAccessCustomerScopes(scopes.filter((s) => s.scope_type === "customer"));
    const locIds = [
      ...new Set(
        scopes
          .filter((s) => s.scope_type === "location" || s.scope_type === "warehouse")
          .map((s) => s.record_id),
      ),
    ];
    setAccessBranchIds(locIds);
    if (row.home_location_id && locIds.length > 0 && !locIds.includes(row.home_location_id)) {
      setAccessHomeId(null);
    }
  };

  const saveAccess = async () => {
    const row = accessUser();
    if (!row) return;
    const branches = accessBranchIds();
    let home = accessHomeId();
    if (home != null && branches.length > 0 && !branches.includes(home)) {
      toast.warning("Home branch must be one of the allowed branches.");
      return;
    }
    if (branches.length > 0 && !roleAppliesScopes(accessRole())) {
      const roleRow = (roles.data ?? []).find((r) => r.role_code === accessRole());
      const ok = confirm(
        `Job “${roleRow?.role_name ?? accessRole()}” is not branch-limited yet.\n\n` +
          `Without “Limit to assigned branches/customers” on the job, branch selections are stored but the user still sees company-wide data.\n\n` +
          `Enable branch limits on this job now?`,
      );
      if (ok && roleRow) {
        const patch = await apiFetch(
          `/api/v1/user-management/roles/${roleRow.id}`,
          { method: "PATCH", body: JSON.stringify({ apply_user_scopes: true }) },
          { silent: true },
        );
        if (!patch.success) {
          toast.warning(patch.message ?? "Could not enable branch limits on the job.");
          return;
        }
        invalidate.all();
      }
    }
    if (branches.length === 0 && roleAppliesScopes(accessRole())) {
      if (
        !confirm(
          "No branches selected and this job is branch-limited. The user will see no branch records until you assign branches. Continue?",
        )
      ) {
        return;
      }
    }

    setSaving(true);
    try {
      const merged: UserDataScope[] = [
        ...accessCustomerScopes(),
        ...branches.map((id) => ({ scope_type: "location", record_id: id })),
      ];
      const scopeRes = await saveUserDataScopes(row.id, merged);
      if (!scopeRes.success) {
        toast.warning(scopeRes.message ?? "Failed to save branches.");
        return;
      }
      const patchRes = await apiFetch(
        `/api/v1/user-management/users/${row.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            tenant_role: accessRole(),
            home_location_id: home && home > 0 ? home : 0,
          }),
        },
        { silent: true },
      );
      if (!patchRes.success) {
        toast.warning(patchRes.message ?? "Failed to save role/home.");
        return;
      }
      toast.success("Access saved.");
      setAccessOpen(false);
      invalidate.all();
    } finally {
      setSaving(false);
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
    const branches = inviteBranchIds();
    const home = inviteHomeId();
    if (home != null && branches.length > 0 && !branches.includes(home)) {
      toast.warning("Home branch must be one of the allowed branches.");
      return;
    }

    if (branches.length > 0 && !roleAppliesScopes(inviteRole())) {
      const roleRow = (roles.data ?? []).find((r) => r.role_code === inviteRole());
      const ok = confirm(
        `Job “${roleRow?.role_name ?? inviteRole()}” is not branch-limited yet.\n\n` +
          `Enable branch limits on this job so assigned branches take effect?`,
      );
      if (ok && roleRow) {
        const patch = await apiFetch(
          `/api/v1/user-management/roles/${roleRow.id}`,
          { method: "PATCH", body: JSON.stringify({ apply_user_scopes: true }) },
          { silent: true },
        );
        if (!patch.success) {
          toast.warning(patch.message ?? "Could not enable branch limits on the job.");
          return;
        }
      }
    }

    setSaving(true);
    try {
      const res = await apiFetch<TenantUserRow>(
        "/api/v1/user-management/invites",
        {
          method: "POST",
          body: JSON.stringify({
            email,
            full_name: fullName,
            tenant_role: inviteRole(),
          }),
        },
        { silent: true },
      );
      if (!res.success || !res.data?.id) {
        toast.warning(res.message ?? "Could not invite user.");
        return;
      }
      const userId = res.data.id;
      if (branches.length > 0) {
        const scopeRes = await saveUserDataScopes(
          userId,
          branches.map((id) => ({ scope_type: "location", record_id: id })),
        );
        if (!scopeRes.success) {
          toast.warning(scopeRes.message ?? "Invite created but branches failed to save. Use Access to fix.");
        }
      }
      if (home != null || branches.length > 0) {
        const patchRes = await apiFetch(
          `/api/v1/user-management/users/${userId}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              home_location_id: home && home > 0 ? home : 0,
            }),
          },
          { silent: true },
        );
        if (!patchRes.success) {
          toast.warning(patchRes.message ?? "Invite created but home branch failed to save. Use Access to fix.");
        }
      }
      toast.success(
        res.message ??
          `Invite saved. Ask them to sign in at /signin with Google using ${email} (same address).`,
      );
      setInviteOpen(false);
      // Keep pending invites visible after invite (default Active filter used to hide them).
      if (statusFilter() === "active") setStatusFilter("active_pending");
      invalidate.all();
    } finally {
      setSaving(false);
    }
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
    setSaving(false);
    if (!ok) return;
    setEditOpen(false);
    invalidate.all();
  };

  const softDelete = async (row: TenantUserRow) => {
    if (row.is_owner) {
      toast.warning(
        "Cannot delete the company owner from User Management. Transfer ownership to another active user first (More → Make company owner), then delete them. Close & wipe in Platform Command deletes the whole company — including this owner and all data.",
      );
      return;
    }
    if (row.id === auth.me?.user?.id) {
      toast.warning("You cannot delete your own account.");
      return;
    }
    if (
      !confirm(
        `Soft-delete ${row.full_name || row.email}? They lose access immediately. Role, overrides, and data scopes are kept for restore.`,
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
    toast.success("User restored with prior role, overrides, and scopes.");
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

  const resendInvite = async (row: TenantUserRow) => {
    if (!row.invite_id) return;
    const res = await apiFetch(
      `/api/v1/user-management/invites/${row.invite_id}/resend`,
      { method: "POST" },
      { silent: true },
    );
    if (!res.success) {
      toast.warning(res.message ?? "Failed to resend invite.");
      return;
    }
    toast.success(res.message ?? "Invite email re-queued.");
  };

  /** Safe re-invite: keeps role/overrides/scopes/auth; emails sign-in + set-password. */
  const reinviteKeepData = async (row: TenantUserRow) => {
    if (
      !confirm(
        `Re-invite ${row.full_name || row.email} and send a set-password link?\n\nKeeps their role, overrides, and data scopes. They get an email to sign in and set a new password.`,
      )
    ) {
      return;
    }
    setMenuOpenId(null);
    const res = await apiFetch(
      `/api/v1/user-management/users/${row.id}/reinvite`,
      { method: "POST", body: JSON.stringify({}) },
      { silent: true },
    );
    if (!res.ok) {
      toast.warning(res.message ?? "Could not re-invite user.");
      return;
    }
    toast.success(res.message ?? "Re-invite sent with set-password link. Their data was kept.");
    invalidate.all();
  };

  const resetForReinvite = async (row: TenantUserRow) => {
    if (row.is_owner) {
      toast.warning("Cannot reset the tenant owner.");
      return;
    }
    if (
      !confirm(
        `Remove access and reset ${row.full_name || row.email} for re-invite?\n\nClears data scopes and overrides; unlinks Google; status becomes Pending invite.\n\nPrefer “Re-invite + set password” if you only need to resend access or let them set a password.`,
      )
    ) {
      return;
    }
    setMenuOpenId(null);
    const res = await apiFetch(
      `/api/v1/user-management/users/${row.id}/reset-for-reinvite`,
      { method: "POST", body: JSON.stringify({}) },
      { silent: true },
    );
    if (!res.ok) {
      toast.warning(res.message ?? "Could not reset user for re-invite.");
      return;
    }
    toast.success("User reset. They must sign in with Google using this email to rejoin.");
    invalidate.all();
  };

  const openDataScopes = (row: TenantUserRow) => {
    closeRowMenu();
    navigate(`/app/user-management/user-permissions?userId=${row.id}`);
  };

  const canTransferOwnership = () => {
    const u = auth.me?.user;
    if (!u) return false;
    const email = (u.email ?? "").trim().toLowerCase();
    return Boolean(u.is_platform_superadmin || u.is_tenant_owner || PLATFORM_CONSOLE_EMAILS.has(email));
  };

  const transferOwnership = async (row: TenantUserRow) => {
    if (row.is_owner) {
      toast.warning("This person is already the company owner.");
      return;
    }
    if (row.status !== "active") {
      toast.warning("Ownership can only move to an active user. Restore them first.");
      return;
    }
    const company = auth.me?.tenant?.company_code || "this company";
    if (
      !confirm(
        `Make ${row.full_name || row.email} the owner of ${company}?\n\nThe current owner stays as a user (store admin) and can be deleted after this. This does not wipe company data.`,
      )
    ) {
      return;
    }
    setMenuOpenId(null);
    const res = await apiFetch(
      `/api/v1/user-management/users/${row.id}/transfer-ownership`,
      { method: "POST", body: JSON.stringify({ acknowledge: true }) },
      { silent: true },
    );
    if (!res.ok) {
      toast.error(res.message ?? "Could not transfer ownership.");
      return;
    }
    toast.success(res.message ?? `${row.full_name || row.email} is now the company owner.`);
    invalidate.all();
    await auth.refresh({ background: true });
  };

  const rows = () => list.data?.rows ?? [];

  const hasMoreItems = (row: TenantUserRow) => {
    if (row.is_owner) return true; // Effective access tip only — still show More with Effective
    if (row.status === "invited") return Boolean(row.invite_id);
    if (row.status === "disabled") return true;
    if (row.status === "active") return true;
    return false;
  };

  const previewEntries = () => {
    const eff = previewPerms.data?.effective ?? {};
    return Object.entries(eff)
      .filter(([, lvl]) => lvl && lvl !== "deny")
      .sort(([a], [b]) => a.localeCompare(b));
  };

  return (
    <div class="space-y-3">
      <p class="text-sm text-text-secondary">
        Invite people and set their <strong>Access</strong> (job + branches + home) in one place. The company owner
        cannot be deleted until ownership is transferred via <strong>Make company owner</strong>. Defaults to{" "}
        <strong>Active + pending</strong> so invites stay visible until Google sign-in. Use{" "}
        <strong>Overrides</strong> for rare exceptions;{" "}
        <A href="/app/user-management/user-permissions" class="text-brand-600 hover:underline">
          Data scopes
        </A>{" "}
        for advanced customer limits. User groups stay retired for now.
      </p>
      <Show when={(list.data?.rows ?? []).some((r) => r.status === "invited")}>
        <div class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-950">
          <span class="font-medium">
            {(list.data?.rows ?? []).filter((r) => r.status === "invited").length} pending invite
            {(list.data?.rows ?? []).filter((r) => r.status === "invited").length === 1 ? "" : "s"}
          </span>{" "}
          on this page — waiting for Google sign-in. They move to Active automatically after they access the app.
        </div>
      </Show>
      <SpreadsheetGrid
        columns={[
          { key: "email", header: "Email", sortable: true },
          { key: "full_name", header: "Full name", sortable: true },
          {
            key: "tenant_role",
            header: "Job",
            render: (row) => (
              <span>
                {row.tenant_role}
                {row.is_owner ? " (Owner)" : ""}
              </span>
            ),
          },
          {
            key: "home_location_name",
            header: "Home branch",
            render: (row) => (
              <span class="text-sm text-text-secondary">{row.home_location_name || (row.is_owner ? "All" : "—")}</span>
            ),
          },
          {
            key: "status",
            header: "Status",
            render: (row) => (
              <Show
                when={row.status === "disabled"}
                fallback={
                  <Show
                    when={row.status === "invited"}
                    fallback={
                      <span class="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900">
                        Active
                      </span>
                    }
                  >
                    <span
                      class="inline-flex flex-col items-start gap-0.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-950 ring-1 ring-amber-200"
                      title="Invite sent — waiting for Google sign-in. Status becomes Active after they join."
                    >
                      <span class="inline-flex items-center gap-1.5">
                        <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
                        Pending invite
                      </span>
                      <Show when={row.invited_at}>
                        <span class="pl-3 font-normal text-amber-900/80">
                          Sent {new Date(row.invited_at!).toLocaleString()}
                        </span>
                      </Show>
                    </span>
                  </Show>
                }
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
              <div class="flex items-center gap-2" data-user-row-menu onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  class="text-sm text-brand-600 hover:underline"
                  onClick={() => void openEdit(row)}
                >
                  Edit
                </button>
                <Show when={!row.is_owner && row.status !== "disabled"}>
                  <button
                    type="button"
                    class="text-sm text-brand-600 hover:underline"
                    onClick={() => void openAccess(row)}
                  >
                    Access
                  </button>
                </Show>
                <Show when={hasMoreItems(row)}>
                  <button
                    type="button"
                    class="rounded border border-stroke px-2 py-0.5 text-xs font-medium text-text-secondary hover:bg-slate-50"
                    aria-expanded={menuOpenId() === row.id}
                    aria-haspopup="menu"
                    onClick={(e) => {
                      e.stopPropagation();
                      openRowMenu(row, e.currentTarget);
                    }}
                  >
                    More ▾
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
        pageSize={pageSize()} onPageSizeChange={setPageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        search={q()}
        onSearchChange={setQ}
        searchPlaceholder="Search email or name…"
        status={statusFilter()}
        onStatusChange={setStatusFilter}
        statusLabel="Status"
        statusOptions={[
          { value: "active_pending", label: "Active + pending" },
          { value: "active", label: "Active only" },
          { value: "invited", label: "Pending invite" },
          { value: "disabled", label: "Deleted" },
          { value: "", label: "All" },
        ]}
        onRefresh={() => invalidate.users()}
      />

      <Show when={menuOpenId() != null && menuPos() && menuRow()}>
        <Portal>
          <div
            data-user-row-menu
            role="menu"
            class="fixed z-[80] min-w-[13rem] rounded-lg border border-stroke bg-white py-1 shadow-lg"
            style={{ top: `${menuPos()!.top}px`, left: `${menuPos()!.left}px` }}
          >
            <Show when={(menuRow()!.status === "active" || menuRow()!.status === "invited") && !menuRow()!.is_owner}>
              <p class="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
                Access
              </p>
              <button
                type="button"
                role="menuitem"
                class="block w-full px-3 py-1.5 text-left text-sm font-medium text-brand-700 hover:bg-brand-50"
                onClick={() => {
                  const row = menuRow()!;
                  closeRowMenu();
                  void openAccess(row);
                }}
              >
                Job &amp; branches
              </button>
              <Show when={menuRow()!.status === "active"}>
                <button
                  type="button"
                  role="menuitem"
                  class="block w-full px-3 py-1.5 text-left text-sm text-text-primary hover:bg-slate-50"
                  onClick={() => {
                    const row = menuRow()!;
                    closeRowMenu();
                    openOverrides(row);
                  }}
                >
                  Overrides
                </button>
              </Show>
              <button
                type="button"
                role="menuitem"
                class="block w-full px-3 py-1.5 text-left text-sm text-text-primary hover:bg-slate-50"
                onClick={() => {
                  const row = menuRow()!;
                  closeRowMenu();
                  openEffectivePreview(row);
                }}
              >
                Effective access
              </button>
              <button
                type="button"
                role="menuitem"
                class="block w-full px-3 py-1.5 text-left text-sm text-text-primary hover:bg-slate-50"
                onClick={() => {
                  const row = menuRow()!;
                  openDataScopes(row);
                }}
              >
                Data scopes
              </button>
              <Show when={canTransferOwnership() && menuRow()!.status === "active"}>
                <button
                  type="button"
                  role="menuitem"
                  class="block w-full px-3 py-1.5 text-left text-sm font-medium text-brand-700 hover:bg-brand-50"
                  onClick={() => {
                    const row = menuRow()!;
                    closeRowMenu();
                    void transferOwnership(row);
                  }}
                >
                  Make company owner
                </button>
              </Show>
            </Show>
            <Show when={menuRow()!.is_owner}>
              <button
                type="button"
                role="menuitem"
                class="block w-full px-3 py-1.5 text-left text-sm text-text-primary hover:bg-slate-50"
                onClick={() => {
                  const row = menuRow()!;
                  closeRowMenu();
                  openEffectivePreview(row);
                }}
              >
                Effective access
              </button>
            </Show>
            <p class="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
              Lifecycle
            </p>
            <Show when={menuRow()!.status === "active" || menuRow()!.status === "disabled" || menuRow()!.status === "invited"}>
              <button
                type="button"
                role="menuitem"
                class="block w-full px-3 py-1.5 text-left text-sm text-brand-600 hover:bg-slate-50"
                onClick={() => {
                  const row = menuRow()!;
                  void reinviteKeepData(row);
                }}
              >
                Re-invite + set password
              </button>
            </Show>
            <Show when={menuRow()!.status === "active"}>
              <Show when={!menuRow()!.is_owner}>
                <button
                  type="button"
                  role="menuitem"
                  class="block w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
                  onClick={() => {
                    const row = menuRow()!;
                    closeRowMenu();
                    void softDelete(row);
                  }}
                >
                  Delete
                </button>
                <button
                  type="button"
                  role="menuitem"
                  class="block w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
                  onClick={() => {
                    const row = menuRow()!;
                    void resetForReinvite(row);
                  }}
                >
                  Remove &amp; reset for re-invite
                </button>
              </Show>
            </Show>
            <Show when={menuRow()!.status === "disabled"}>
              <Show when={menuRow()!.auth_linked}>
                <button
                  type="button"
                  role="menuitem"
                  class="block w-full px-3 py-1.5 text-left text-sm text-emerald-700 hover:bg-emerald-50"
                  onClick={() => {
                    const row = menuRow()!;
                    closeRowMenu();
                    void restoreUser(row);
                  }}
                >
                  Restore
                </button>
              </Show>
              <Show when={menuRow()!.auth_linked && !menuRow()!.is_owner}>
                <button
                  type="button"
                  role="menuitem"
                  class="block w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
                  onClick={() => {
                    const row = menuRow()!;
                    void resetForReinvite(row);
                  }}
                >
                  Reset for re-invite
                </button>
              </Show>
            </Show>
            <Show when={menuRow()!.status === "invited" && menuRow()!.invite_id}>
              <button
                type="button"
                role="menuitem"
                class="block w-full px-3 py-1.5 text-left text-sm text-brand-600 hover:bg-slate-50"
                onClick={() => {
                  const row = menuRow()!;
                  closeRowMenu();
                  void resendInvite(row);
                }}
              >
                Resend invite
              </button>
              <button
                type="button"
                role="menuitem"
                class="block w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
                onClick={() => {
                  const row = menuRow()!;
                  closeRowMenu();
                  void revokeInvite(row);
                }}
              >
                Revoke
              </button>
            </Show>
          </div>
        </Portal>
      </Show>

      <EntityModal
        open={inviteOpen()}
        title="Invite user"
        onClose={() => setInviteOpen(false)}
        onSave={() => void sendInvite()}
        saving={saving()}
        saveLabel="Send invite"
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
        <Field label="Job *">
          <select class={inputClass} value={inviteRole()} onChange={(e) => setInviteRole(e.currentTarget.value)}>
            <For each={roles.data ?? []}>
              {(role) => (
                <option value={role.role_code} disabled={!role.is_active}>
                  {role.role_name}
                  {role.apply_user_scopes ? " (branch-limited)" : ""}
                </option>
              )}
            </For>
          </select>
        </Field>
        <Field label="Allowed branches">
          <div class="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-stroke p-2">
            <For each={locations()} fallback={<p class="text-xs text-text-secondary">No locations found.</p>}>
              {(loc) => (
                <label class="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={inviteBranchIds().includes(loc.id)}
                    onChange={(e) => {
                      const next = toggleBranchId(inviteBranchIds(), loc.id, e.currentTarget.checked);
                      setInviteBranchIds(next);
                      const home = inviteHomeId();
                      if (home != null && !next.includes(home)) setInviteHomeId(null);
                    }}
                  />
                  {loc.label}
                </label>
              )}
            </For>
          </div>
        </Field>
        <Field label="Home branch">
          <select
            class={inputClass}
            value={inviteHomeId() ?? ""}
            onChange={(e) => {
              const v = e.currentTarget.value;
              setInviteHomeId(v ? Number(v) : null);
            }}
          >
            <option value="">None</option>
            <For each={locations().filter((l) => inviteBranchIds().length === 0 || inviteBranchIds().includes(l.id))}>
              {(loc) => <option value={loc.id}>{loc.label}</option>}
            </For>
          </select>
        </Field>
        <Show when={inviteBranchIds().length > 0 && !roleAppliesScopes(inviteRole())}>
          <p class="text-xs text-amber-700">
            This job is not branch-limited yet. On save you can enable limits so branches take effect.
          </p>
        </Show>
        <p class="text-xs text-text-secondary">
          We email an invite when Resend (`RESEND_API_KEY`) or SMTP is configured on the API. They join by signing in
          with Google using this exact email — no separate Accept step. If email is not configured, the invite stays
          pending and you can share /signin.
        </p>
      </EntityModal>

      <EntityModal
        open={accessOpen()}
        title={`Access — ${accessUser()?.full_name || accessUser()?.email || "User"}`}
        onClose={() => setAccessOpen(false)}
        onSave={() => void saveAccess()}
        saving={saving() || accessLoading()}
        saveLabel="Save access"
      >
        <Show when={!accessLoading()} fallback={<p class="text-sm text-text-secondary">Loading…</p>}>
          <Field label="Job *">
            <select class={inputClass} value={accessRole()} onChange={(e) => setAccessRole(e.currentTarget.value)}>
              <For each={roles.data ?? []}>
                {(role) => (
                  <option value={role.role_code} disabled={!role.is_active}>
                    {role.role_name}
                    {role.apply_user_scopes ? " (branch-limited)" : ""}
                  </option>
                )}
              </For>
            </select>
          </Field>
          <Field label="Allowed branches">
            <div class="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-stroke p-2">
              <For each={locations()} fallback={<p class="text-xs text-text-secondary">No locations found.</p>}>
                {(loc) => (
                  <label class="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={accessBranchIds().includes(loc.id)}
                      onChange={(e) => {
                        const next = toggleBranchId(accessBranchIds(), loc.id, e.currentTarget.checked);
                        setAccessBranchIds(next);
                        const home = accessHomeId();
                        if (home != null && !next.includes(home)) setAccessHomeId(null);
                      }}
                    />
                    {loc.label}
                  </label>
                )}
              </For>
            </div>
            <Show when={accessCustomerScopes().length > 0}>
              <p class="mt-1 text-xs text-text-secondary">
                {accessCustomerScopes().length} customer scope(s) kept when you save (edit under Data scopes).
              </p>
            </Show>
          </Field>
          <Field label="Home branch">
            <select
              class={inputClass}
              value={accessHomeId() ?? ""}
              onChange={(e) => {
                const v = e.currentTarget.value;
                setAccessHomeId(v ? Number(v) : null);
              }}
            >
              <option value="">None</option>
              <For
                each={locations().filter(
                  (l) => accessBranchIds().length === 0 || accessBranchIds().includes(l.id),
                )}
              >
                {(loc) => <option value={loc.id}>{loc.label}</option>}
              </For>
            </select>
          </Field>
          <Show when={accessBranchIds().length > 0 && !roleAppliesScopes(accessRole())}>
            <p class="text-xs text-amber-700">
              This job is not branch-limited. Saving will offer to enable limits so branches take effect.
            </p>
          </Show>
          <Show when={accessBranchIds().length === 0 && roleAppliesScopes(accessRole())}>
            <p class="text-xs text-amber-700">
              Branch-limited job with no branches — user will see no branch records until you assign some.
            </p>
          </Show>
          <p class="text-xs text-text-secondary">
            Advanced:{" "}
            <A href="/app/user-management/user-permissions" class="text-brand-600 hover:underline">
              Data scopes
            </A>
            {" · "}
            <A href="/app/user-management/roles" class="text-brand-600 hover:underline">
              Jobs
            </A>
          </p>
        </Show>
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
                    <option value="invited">Pending invite</option>
                  </Show>
                </select>
              </Field>
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
          Rare exceptions on top of role <span class="font-medium">{userPerms.data?.tenant_role}</span>. Choose{" "}
          <strong>Role</strong> to inherit the role default. Prefer changing the role matrix when many people need the
          same access.
        </p>
        <PermissionMatrix
          groups={registry.data ?? []}
          values={permValues()}
          allowInherit
          roleDefaults={userPerms.data?.effective as Record<string, AccessLevel> | undefined}
          loading={registry.isLoading || userPerms.isLoading}
          title="Per-user overrides. Effective access is the role level unless one of these overrides changes it."
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
          Runtime matrix for role <strong>{previewPerms.data?.tenant_role}</strong>, then overrides. Matches what the
          app enforces after sign-in.
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
