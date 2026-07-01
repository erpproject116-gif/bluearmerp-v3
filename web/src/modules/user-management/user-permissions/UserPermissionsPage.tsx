import { createSignal, For, Show } from "solid-js";
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

export default function UserPermissionsPage() {
  const toast = useToast();
  const { page, setPage, q, setQ, sort, order, pageSize } = useListState("email");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<TenantUserRow | null>(null);
  const [scopes, setScopes] = createSignal<UserDataScope[]>([]);
  const [customers, setCustomers] = createSignal<ScopeOption[]>([]);
  const [locations, setLocations] = createSignal<ScopeOption[]>([]);
  const [saving, setSaving] = createSignal(false);
  const [loadingScopes, setLoadingScopes] = createSignal(false);

  const list = useTenantUserList(() => ({
    page: page(),
    pageSize,
    sort: sort(),
    order: order(),
    q: q() || undefined,
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
    setEditing(row);
    setModalOpen(true);
    setLoadingScopes(true);
    await loadOptions();
    const res = await fetchUserDataScopes(row.id);
    setScopes(res.data ?? []);
    setLoadingScopes(false);
  };

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
      <p class="text-sm text-text-secondary">
        Restrict users to specific customers, locations, or warehouses when their role has{" "}
        <strong>Apply user scopes</strong> enabled.
      </p>
      <SpreadsheetGrid
        columns={[
          { key: "email", header: "Email", clickable: true },
          { key: "full_name", header: "Name" },
          { key: "tenant_role", header: "Role" },
          {
            key: "actions",
            header: "Actions",
            render: (row) => (
              <button
                type="button"
                class="text-sm text-brand-600 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  void openScopes(row);
                }}
              >
                Data scopes
              </button>
            ),
          },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={(row) => void openScopes(row)}
        onNew={() => {}}
        codeKey="email"
        nameKey="full_name"
        page={page()}
        pageSize={pageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        search={q()}
        onSearchChange={setQ}
        searchPlaceholder="Search users…"
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
