import { createSignal } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import { LookupCombo, type LookupOption } from "../../shared/LookupCombo";
import { useToast } from "../../shared/toast";
import { apiFetch } from "../../shared/api";

type CommissionRule = {
  id: number;
  name: string;
  salesperson_user_id?: number | null;
  item_category_id?: number | null;
  item_category_name?: string | null;
  rate_pct: number;
  active: boolean;
};

type CommissionAccrual = {
  id: number;
  sales_id: number;
  rule_id?: number | null;
  base_amount: number;
  commission_amount: number;
  status: string;
};

type ItemCategory = { id: number; code: string; name: string };

async function fetchUsers(q: string): Promise<LookupOption[]> {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  const res = await apiFetch<{ id: number; full_name: string; email: string }[]>(`/api/v1/inventory/after-sales/users${qs}`);
  return (res.data ?? []).map((u) => ({ id: u.id, label: u.full_name, sublabel: u.email }));
}

export default function CommissionRulesPage() {
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [name, setName] = createSignal("");
  const [ratePct, setRatePct] = createSignal("5");
  const [salespersonId, setSalespersonId] = createSignal<number | null>(null);
  const [salespersonLabel, setSalespersonLabel] = createSignal("");
  const [categoryId, setCategoryId] = createSignal<number | null>(null);
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const client = useQueryClient();

  const categories = createQuery(() => ({
    queryKey: ["item-categories"],
    queryFn: async () => {
      const res = await apiFetch<ItemCategory[]>("/api/v1/inventory/item-categories");
      if (!res.success) throw new Error(res.message ?? "Failed to load categories");
      return res.data ?? [];
    },
  }));

  const list = createQuery(() => ({
    queryKey: ["commission-rules"],
    queryFn: async () => {
      const res = await apiFetch<CommissionRule[]>("/api/v1/sales/commission-rules");
      if (!res.success) throw new Error(res.message ?? "Failed to load rules");
      return { rows: res.data ?? [], total: res.data?.length ?? 0 };
    },
  }));

  const accruals = createQuery(() => ({
    queryKey: ["commission-accruals"],
    queryFn: async () => {
      const res = await apiFetch<CommissionAccrual[]>("/api/v1/sales/commission-accruals");
      if (!res.success) throw new Error(res.message ?? "Failed to load accruals");
      return { rows: res.data ?? [], total: res.data?.length ?? 0 };
    },
  }));

  const openNew = () => {
    setName("");
    setRatePct("5");
    setSalespersonId(null);
    setSalespersonLabel("");
    setCategoryId(null);
    setModalOpen(true);
  };

  const save = async () => {
    if (!name().trim()) {
      toast.warning("Name is required.");
      return;
    }
    setSaving(true);
    const res = await apiFetch<CommissionRule>("/api/v1/sales/commission-rules", {
      method: "POST",
      body: JSON.stringify({
        name: name().trim(),
        rate_pct: Number(ratePct()) || 0,
        salesperson_user_id: salespersonId() || null,
        item_category_id: categoryId() || null,
        active: true,
      }),
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to create rule.");
      return;
    }
    toast.success("Commission rule created.");
    setModalOpen(false);
    void client.invalidateQueries({ queryKey: ["commission-rules"] });
  };

  return (
    <div class="space-y-4">
      <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h2 class="text-lg font-semibold text-text-primary">Sales commission rules</h2>
        <p class="mt-1 text-sm text-text-secondary">
          Accrues on completed sales. Match by salesperson (PIC), item category line totals, or both.
        </p>
      </section>
      <SpreadsheetGrid<CommissionRule>
        columns={[
          { key: "name", header: "Name", clickable: true },
          { key: "item_category_name", header: "Category", render: (r) => r.item_category_name ?? "All" },
          { key: "rate_pct", header: "Rate %", render: (r) => `${r.rate_pct}%` },
          { key: "active", header: "Active", render: (r) => (r.active ? "Yes" : "No") },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onNew={openNew}
        onEdit={() => {}}
        codeKey="name"
        nameKey="name"
        total={list.data?.total ?? 0}
        search=""
        onSearchChange={() => {}}
        onRefresh={() => void client.invalidateQueries({ queryKey: ["commission-rules"] })}
      />
      <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h3 class="text-base font-semibold text-text-primary">Commission accruals</h3>
        <p class="mt-1 text-sm text-text-secondary">Posted when sales progress status becomes Completed.</p>
      </section>
      <SpreadsheetGrid<CommissionAccrual>
        columns={[
          { key: "sales_id", header: "Sales ID", clickable: true },
          { key: "rule_id", header: "Rule" },
          {
            key: "base_amount",
            header: "Base",
            render: (r) => r.base_amount.toLocaleString(undefined, { minimumFractionDigits: 2 }),
          },
          {
            key: "commission_amount",
            header: "Commission",
            render: (r) => r.commission_amount.toLocaleString(undefined, { minimumFractionDigits: 2 }),
          },
          { key: "status", header: "Status", render: (r) => <span class="capitalize">{r.status}</span> },
        ]}
        rows={accruals.data?.rows ?? []}
        loading={accruals.isFetching}
        selectedId={null}
        onSelect={() => {}}
        onNew={() => {}}
        onEdit={() => {}}
        codeKey="sales_id"
        nameKey="sales_id"
        total={accruals.data?.total ?? 0}
        search=""
        onSearchChange={() => {}}
        onRefresh={() => void client.invalidateQueries({ queryKey: ["commission-accruals"] })}
      />
      <EntityModal open={modalOpen()} title="New commission rule" onClose={() => setModalOpen(false)} onSave={() => void save()} saving={saving()} singleColumn>
        <Field label="Name *">
          <input class={inputClass} value={name()} onInput={(e) => setName(e.currentTarget.value)} />
        </Field>
        <Field label="Rate %">
          <input class={inputClass} type="number" min="0" step="0.01" value={ratePct()} onInput={(e) => setRatePct(e.currentTarget.value)} />
        </Field>
        <LookupCombo
          label="Salesperson (optional — matches sale PIC)"
          value={salespersonLabel}
          selectedId={salespersonId}
          onInput={setSalespersonLabel}
          onSelect={(o) => {
            setSalespersonId(o.id);
            setSalespersonLabel(o.label);
          }}
          onClear={() => {
            setSalespersonId(null);
            setSalespersonLabel("");
          }}
          fetchOptions={fetchUsers}
        />
        <Field label="Item category (optional — commission on matching line totals)">
          <select class={inputClass} value={categoryId() ?? ""} onChange={(e) => setCategoryId(e.currentTarget.value ? Number(e.currentTarget.value) : null)}>
            <option value="">All categories (grand total)</option>
            {(categories.data ?? []).map((c) => (
              <option value={String(c.id)}>{c.name}</option>
            ))}
          </select>
        </Field>
      </EntityModal>
    </div>
  );
}
