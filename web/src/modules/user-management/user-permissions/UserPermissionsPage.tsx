import { A, useSearchParams } from "@solidjs/router";
import { createEffect, createSignal, For, Show } from "solid-js";
import { EntityModal, Field, SpreadsheetGrid } from "../../../shared/SpreadsheetGrid";
import { useToast } from "../../../shared/toast";
import { useListState } from "../../../shared/useListState";
import { useTenantUserList, type TenantUserRow } from "../../../shared/useUserManagement";
import {
  fetchUserDataScopes,
  saveUserDataScopes,
  type UserDataScope,
} from "../../../shared/usePermissions";
import { apiFetch } from "../../../shared/api";

type ScopeOption = { id: number; label: string };

function statusLabel(status: string) {
  if (status === "invited") return "Invited";
  if (status === "disabled") return "Deleted";
  return "Active";
}

export default function UserPermissionsPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, pageSize } = useListState("email", 25, {
    defaultStatus: "active",
  });
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<TenantUserRow | null>(null);
  const [scopes, setScopes] = createSignal<UserDataScope[]>([]);
  const [customers, setCustomers] = createSignal<ScopeOption[]>([]);
  const [locations, setLocations] = createSignal<ScopeOption[]>([]);
  const [saving, setSaving] = createSignal(false);
  const [loadingScopes, setLoadingScopes] = createSignal(false);
  const [deepLinkHandled, setDeepLinkHandled] = createSignal(false);

  const list = useTenantUserList(() => ({
    page: page(),
    pageSize,
    sort: sort(),
    order: order(),
    q: q() || undefined,
    status: statusFilter() || undefined,
  }));

  const loadOptions = async () => {
    const [partnersRes, locRes] = await Promise.all([
      apiFetch<Array<{ id: number; company_name: string; partner_kind: string }>>(
        "/api/v1/inventory/partners?pageSize=500&status=active",
      ),
      apiFetch<Array<{ id: number; location_name: string }>>("/api/v1/inventory/locations?pageSize=500"),
    ]);
    const partners = (partnersRes.data ?? []).filter(
      (p) => p.partner_kind === "customer" || p.partner_kind === "both",
    );
    setCustomers(partners.map((p) => ({ id: p.id, label: p.company_name })));
    setLocations((locRes.data ?? []).map((l) => ({ id: l.id, label: l.location_name })));
  };

  const openScopes = async (row: TenantUserRow) => {
    if (row.status === "disabled") {
      toast.warning("Restore this user on Users before editing data scopes.");
      return;
    }
    setEditing(row);
    setModalOpen(true);
    setLoadingScopes(true);
    await loadOptions();
    const res = await fetchUserDataScopes(row.id);
    setScopes(res.data ?? []);
    setLoadingScopes(false);
  };

  createEffect(() => {
    if (deepLinkHandled() || list.isLoading) return;
    const raw = searchParams.userId;
    const idStr = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
    const userId = Number(idStr);
    if (!userId || Number.isNaN(userId)) return;

    const fromPage = (list.data?.rows ?? []).find((u) => u.id === userId);
    if (fromPage) {
      setDeepLinkHandled(true);
      setSelectedId(fromPage.id);
      void openScopes(fromPage);
      setSearchParams({ userId: undefined });
      return;
    }

    // Not on current page/filter — fetch directly then open.
    void (async () => {
      setDeepLinkHandled(true);
      const res = await apiFetch<{ rows: TenantUserRow[] }>(
        `/api/v1/user-management/users?page=1&pageSize=500&status=`,
        undefined,
        { silent: true },
      );
      const row = (res.data?.rows ?? []).find((u) => u.id === userId);
      setSearchParams({ userId: undefined });
      if (!row) {
        toast.warning("User not found for data scopes.");
        return;
      }
      setSelectedId(row.id);
      await openScopes(row);
    })();
  });

  const toggleScope = (scopeType: string, recordId: number, checked: boolean) => {
    setScopes((prev) => {
      const without = prev.filter((s) => !(s.scope_type === scopeType && s.record_id === recordId));
      if (!checked) return without;
      return [...without, { scope_type: scopeType, record_id: recordId }];
    });
  };

  const isChecked = (scopeType: string, recordId: number) =>
    scopes().some((s) => s.scope_type === scopeType && s.record_id === recordId);

  const save = async () => {
    const user = editing();
    if (!user) return;
    if (user.status === "disabled") {
      toast.warning("Cannot edit scopes for a deleted user.");
      return;
    }
    setSaving(true);
    const res = await saveUserDataScopes(user.id, scopes());
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to save data scopes.");
      return;
    }
    toast.success("Data scopes saved.");
    setModalOpen(false);
  };

  return (
    <div class="space-y-4">
      <div class="space-y-1">
        <h2 class="text-lg font-semibold text-text-primary">Data scopes</h2>
        <p class="text-sm text-text-secondary">
          Limit which customers and locations this user can see when their role has{" "}
          <strong>Apply user data scopes</strong>. Not for roles or delete — manage accounts on{" "}
          <A href="/app/user-management/users" class="text-brand-600 hover:underline">
            Users
          </A>
          .
        </p>
      </div>
      <SpreadsheetGrid
        columns={[
          { key: "email", header: "Email", clickable: true },
          { key: "full_name", header: "Name" },
          { key: "tenant_role", header: "Role" },
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
            key: "actions",
            header: "Actions",
            render: (row) => (
              <Show
                when={row.status !== "disabled"}
                fallback={<span class="text-xs text-text-secondary">Restore on Users</span>}
              >
                <button
                  type="button"
                  class="text-sm text-brand-600 hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    void openScopes(row);
                  }}
                >
                  Edit scopes
                </button>
              </Show>
            ),
          },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={(row) => void openScopes(row)}
        onNew={() => {}}
        showNew={false}
        codeKey="email"
        nameKey="full_name"
        page={page()}
        pageSize={pageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        search={q()}
        onSearchChange={setQ}
        searchPlaceholder="Search users…"
        status={statusFilter()}
        onStatusChange={setStatusFilter}
        statusLabel="Status"
        statusOptions={[
          { value: "active", label: "Active" },
          { value: "", label: "All" },
          { value: "invited", label: "Invited" },
          { value: "disabled", label: "Deleted" },
        ]}
        onRefresh={() => list.refetch()}
      />

      <EntityModal
        open={modalOpen()}
        title={`Data scopes — ${editing()?.full_name ?? editing()?.email ?? "User"}`}
        onClose={() => setModalOpen(false)}
        onSave={() => void save()}
        saving={saving()}
        wide
        singleColumn
      >
        <Show when={!loadingScopes()} fallback={<p class="text-sm text-text-secondary">Loading scopes…</p>}>
          <Show when={scopes().length === 0}>
            <div class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              No scopes selected. If this user's role has <strong>Apply user scopes</strong> enabled, they will
              see <strong>no records</strong> until you assign at least one customer or location below.
            </div>
          </Show>
          <Field label="Customers">
            <div class="max-h-40 overflow-y-auto rounded border border-stroke p-2 space-y-1">
              <For each={customers()}>
                {(opt) => (
                  <label class="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={isChecked("customer", opt.id)}
                      onChange={(e) => toggleScope("customer", opt.id, e.currentTarget.checked)}
                    />
                    {opt.label}
                  </label>
                )}
              </For>
              <Show when={customers().length === 0}>
                <p class="text-xs text-text-secondary">No customers found.</p>
              </Show>
            </div>
          </Field>
          <Field label="Locations / Warehouses">
            <div class="max-h-40 overflow-y-auto rounded border border-stroke p-2 space-y-1">
              <For each={locations()}>
                {(opt) => (
                  <label class="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={isChecked("location", opt.id) || isChecked("warehouse", opt.id)}
                      onChange={(e) => {
                        toggleScope("location", opt.id, e.currentTarget.checked);
                        toggleScope("warehouse", opt.id, e.currentTarget.checked);
                      }}
                    />
                    {opt.label}
                  </label>
                )}
              </For>
              <Show when={locations().length === 0}>
                <p class="text-xs text-text-secondary">No locations found.</p>
              </Show>
            </div>
          </Field>
        </Show>
      </EntityModal>
    </div>
  );
}
