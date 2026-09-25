import { createSignal, For, Show } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { useListState } from "../../shared/useListState";
import { hasPermission, useAuth } from "../../shared/auth-context";

type Unit = {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
};

type Conversion = {
  id: number;
  from_unit_id: number;
  from_code?: string;
  to_unit_id: number;
  to_code?: string;
  factor: number;
};

export default function UnitsPage() {
  const auth = useAuth();
  const canWrite = () => hasPermission(auth.me, "inventory.units", "write");
  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize, setPageSize } =
    useListState("code");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<Unit | null>(null);
  const [form, setForm] = createSignal({ code: "", name: "", is_active: true });
  const [saving, setSaving] = createSignal(false);
  const [convFrom, setConvFrom] = createSignal<number | "">("");
  const [convTo, setConvTo] = createSignal<number | "">("");
  const [convFactor, setConvFactor] = createSignal("1");
  const [convSaving, setConvSaving] = createSignal(false);
  const toast = useToast();
  const client = useQueryClient();

  const list = createQuery(() => {
    const qs = new URLSearchParams({
      page: String(page()),
      pageSize: String(pageSize()),
      sort: sort(),
      order: order(),
    });
    if (q()) qs.set("q", q());
    if (statusFilter()) qs.set("status", statusFilter());
    return {
      queryKey: ["inv-units", page(), pageSize(), sort(), order(), q(), statusFilter()],
      queryFn: async () => {
        const res = await apiFetch<Unit[]>(`/api/v1/inventory/units?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
    };
  });

  const conversions = createQuery(() => ({
    queryKey: ["inv-unit-conversions"],
    queryFn: async () => {
      const res = await apiFetch<Conversion[]>("/api/v1/inventory/unit-conversions");
      if (!res.success) throw new Error(res.message ?? "Failed to load");
      return res.data ?? [];
    },
  }));

  const allUnits = createQuery(() => ({
    queryKey: ["inv-units-all"],
    queryFn: async () => {
      const res = await apiFetch<Unit[]>("/api/v1/inventory/units?page=1&pageSize=200&status=active&sort=code");
      return res.data ?? [];
    },
  }));

  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ["inv-units"] });
    void client.invalidateQueries({ queryKey: ["inv-units-all"] });
    void client.invalidateQueries({ queryKey: ["inv-unit-conversions"] });
  };

  const openNew = () => {
    setEditing(null);
    setForm({ code: "", name: "", is_active: true });
    setModalOpen(true);
  };

  const openEdit = (row: Unit) => {
    setEditing(row);
    setForm({ code: row.code, name: row.name, is_active: row.is_active });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form().code.trim() || !form().name.trim()) {
      toast.warning("Code and name are required.");
      return;
    }
    setSaving(true);
    const ed = editing();
    const res = await apiFetch(
      ed ? `/api/v1/inventory/units/${ed.id}` : "/api/v1/inventory/units",
      { method: ed ? "PATCH" : "POST", body: JSON.stringify(form()) },
      { silent: true },
    );
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to save unit.");
      return;
    }
    toast.success(ed ? "Unit updated." : "Unit created.");
    setModalOpen(false);
    invalidate();
  };

  const saveConversion = async () => {
    const from = Number(convFrom());
    const to = Number(convTo());
    const factor = Number(convFactor());
    if (!from || !to || factor <= 0) {
      toast.warning("Select both units and a positive factor.");
      return;
    }
    setConvSaving(true);
    const res = await apiFetch(
      "/api/v1/inventory/unit-conversions",
      { method: "POST", body: JSON.stringify({ from_unit_id: from, to_unit_id: to, factor }) },
      { silent: true },
    );
    setConvSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to save conversion.");
      return;
    }
    toast.success("Conversion saved.");
    setConvFrom("");
    setConvTo("");
    setConvFactor("1");
    invalidate();
  };

  const deleteConversion = async (id: number) => {
    if (!window.confirm("Delete this conversion?")) return;
    const res = await apiFetch(`/api/v1/inventory/unit-conversions/${id}`, { method: "DELETE" }, { silent: true });
    if (!res.success) {
      toast.warning(res.message ?? "Failed to delete.");
      return;
    }
    toast.success("Conversion deleted.");
    invalidate();
  };

  return (
    <div class="space-y-8">
      <SpreadsheetGrid<Unit>
        columns={[
          { key: "code", header: "Code", clickable: true },
          { key: "name", header: "Name", clickable: true },
          {
            key: "is_active",
            header: "Active",
            sortable: false,
            render: (r) => (r.is_active ? "Yes" : "No"),
          },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onNew={canWrite() ? openNew : () => toast.warning("You need write access to manage units.")}
        onEdit={canWrite() ? openEdit : () => toast.warning("You need write access to manage units.")}
        settingsHref="/app/inventory/units"
        codeKey="code"
        nameKey="name"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        page={page()}
        pageSize={pageSize()} onPageSizeChange={setPageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        search={q()}
        onSearchChange={setQ}
        searchPlaceholder="Search unit code or name…"
        status={statusFilter()}
        onStatusChange={setStatusFilter}
        statusLabel="Status"
        statusOptions={[
          { value: "", label: "All" },
          { value: "active", label: "Active" },
          { value: "inactive", label: "Inactive" },
        ]}
        onRefresh={invalidate}
      />

      <section class="rounded-lg border border-stroke p-4">
        <h2 class="text-sm font-semibold text-text-primary">Unit conversions</h2>
        <p class="mt-1 text-sm text-text-secondary">
          Factor is how many of the <em>to</em> unit equal one <em>from</em> unit (e.g. box → ea × 12).
        </p>
        <Show when={canWrite()}>
          <div class="mt-3 flex flex-wrap items-end gap-2">
            <label class="text-sm">
              <span class="text-text-secondary">From</span>
              <select
                class={`${inputClass} mt-1`}
                value={convFrom()}
                onChange={(e) => setConvFrom(e.currentTarget.value ? Number(e.currentTarget.value) : "")}
              >
                <option value="">Select…</option>
                <For each={allUnits.data ?? []}>{(u) => <option value={u.id}>{u.code} — {u.name}</option>}</For>
              </select>
            </label>
            <label class="text-sm">
              <span class="text-text-secondary">To</span>
              <select
                class={`${inputClass} mt-1`}
                value={convTo()}
                onChange={(e) => setConvTo(e.currentTarget.value ? Number(e.currentTarget.value) : "")}
              >
                <option value="">Select…</option>
                <For each={allUnits.data ?? []}>{(u) => <option value={u.id}>{u.code} — {u.name}</option>}</For>
              </select>
            </label>
            <label class="text-sm">
              <span class="text-text-secondary">Factor</span>
              <input
                type="number"
                min="0"
                step="any"
                class={`${inputClass} mt-1 w-28`}
                value={convFactor()}
                onInput={(e) => setConvFactor(e.currentTarget.value)}
              />
            </label>
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              disabled={convSaving()}
              onClick={() => void saveConversion()}
            >
              Save conversion
            </button>
          </div>
        </Show>
        <ul class="mt-4 divide-y divide-stroke text-sm">
          <For each={conversions.data ?? []} fallback={<li class="py-2 text-text-secondary">No conversions yet.</li>}>
            {(c) => (
              <li class="flex items-center justify-between gap-2 py-2">
                <span>
                  1 {c.from_code} = {c.factor} {c.to_code}
                </span>
                <Show when={canWrite()}>
                  <button type="button" class="text-xs text-red-600 hover:underline" onClick={() => void deleteConversion(c.id)}>
                    Delete
                  </button>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </section>

      <EntityModal
        open={modalOpen()}
        title={editing() ? "Edit unit" : "New unit"}
        onClose={() => setModalOpen(false)}
        onSave={() => void save()}
        saving={saving()}
        singleColumn
      >
        <Field label="Code *">
          <input
            class={inputClass}
            value={form().code}
            disabled={!!editing()}
            onInput={(e) => setForm((f) => ({ ...f, code: e.currentTarget.value }))}
            placeholder="ea, box, kg…"
          />
        </Field>
        <Field label="Name *">
          <input
            class={inputClass}
            value={form().name}
            onInput={(e) => setForm((f) => ({ ...f, name: e.currentTarget.value }))}
          />
        </Field>
        <label class="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form().is_active}
            onChange={(e) => setForm((f) => ({ ...f, is_active: e.currentTarget.checked }))}
          />
          Active
        </label>
      </EntityModal>
    </div>
  );
}
