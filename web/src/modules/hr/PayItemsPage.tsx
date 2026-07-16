import { createSignal, Show } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { Field, inputClass, SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";

type PayItemType = {
  id: number;
  item_code: string;
  item_name: string;
  item_kind: string;
  is_taxable: boolean;
  include_in_sss: boolean;
  is_system: boolean;
  is_active: boolean;
  default_amount: number;
  sort_order: number;
};

export default function PayItemsPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [kind, setKind] = createSignal("");
  const [code, setCode] = createSignal("");
  const [name, setName] = createSignal("");
  const [itemKind, setItemKind] = createSignal("earning");
  const [saving, setSaving] = createSignal(false);
  const [selectedId, setSelectedId] = createSignal<number | null>(null);

  const list = createQuery(() => ({
    queryKey: ["hr-pay-item-types", kind()],
    queryFn: async () => {
      const qs = new URLSearchParams({ page: "1", pageSize: "200", active: "1" });
      if (kind()) qs.set("kind", kind());
      const res = await apiFetch<PayItemType[]>(`/api/v1/hr/pay-item-types?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load");
      return res.data ?? [];
    },
  }));

  const create = async () => {
    if (!code().trim() || !name().trim()) {
      toast.warning("Code and name are required.");
      return;
    }
    setSaving(true);
    const res = await apiFetch<PayItemType>("/api/v1/hr/pay-item-types", {
      method: "POST",
      body: JSON.stringify({
        item_code: code().trim(),
        item_name: name().trim(),
        item_kind: itemKind(),
        is_taxable: itemKind() === "earning",
      }),
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Create failed.");
      return;
    }
    toast.success("Pay item created.");
    setCode("");
    setName("");
    void qc.invalidateQueries({ queryKey: ["hr-pay-item-types"] });
  };

  const toggleActive = async (row: PayItemType) => {
    const res = await apiFetch(`/api/v1/hr/pay-item-types/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: !row.is_active }),
    });
    if (!res.success) {
      toast.warning(res.message ?? "Update failed.");
      return;
    }
    void qc.invalidateQueries({ queryKey: ["hr-pay-item-types"] });
  };

  return (
    <HrLayout>
      <section class="mb-6 rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h2 class="mb-1 text-lg font-medium">Earnings & deductions catalog</h2>
        <p class="mb-3 text-sm text-text-secondary">
          Define reusable allowances and deductions, then assign amounts on each employee. Payroll picks up active
          assignments for the pay period.
        </p>
        <div class="grid gap-3 sm:grid-cols-4">
          <Field label="Code">
            <input class={inputClass} value={code()} onInput={(e) => setCode(e.currentTarget.value)} placeholder="ALLOW_RICE" />
          </Field>
          <Field label="Name">
            <input class={inputClass} value={name()} onInput={(e) => setName(e.currentTarget.value)} placeholder="Rice allowance" />
          </Field>
          <Field label="Kind">
            <select class={inputClass} value={itemKind()} onChange={(e) => setItemKind(e.currentTarget.value)}>
              <option value="earning">Earning</option>
              <option value="deduction">Deduction</option>
            </select>
          </Field>
          <div class="flex items-end">
            <button
              type="button"
              class="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              disabled={saving()}
              onClick={() => void create()}
            >
              {saving() ? "Saving…" : "Add item"}
            </button>
          </div>
        </div>
      </section>

      <div class="mb-3 flex gap-2">
        <button
          type="button"
          class="rounded-lg border border-stroke px-3 py-1.5 text-sm"
          classList={{ "border-brand-500 bg-brand-50": kind() === "" }}
          onClick={() => setKind("")}
        >
          All
        </button>
        <button
          type="button"
          class="rounded-lg border border-stroke px-3 py-1.5 text-sm"
          classList={{ "border-brand-500 bg-brand-50": kind() === "earning" }}
          onClick={() => setKind("earning")}
        >
          Earnings
        </button>
        <button
          type="button"
          class="rounded-lg border border-stroke px-3 py-1.5 text-sm"
          classList={{ "border-brand-500 bg-brand-50": kind() === "deduction" }}
          onClick={() => setKind("deduction")}
        >
          Deductions
        </button>
      </div>

      <SpreadsheetGrid
        columns={[
          { key: "item_code", header: "Code" },
          { key: "item_name", header: "Name" },
          { key: "item_kind", header: "Kind" },
          {
            key: "is_taxable",
            header: "Taxable",
            render: (r: PayItemType) => <span>{r.is_taxable ? "Yes" : "No"}</span>,
          },
          {
            key: "is_system",
            header: "System",
            render: (r: PayItemType) => <span>{r.is_system ? "Yes" : "—"}</span>,
          },
          {
            key: "is_active",
            header: "Active",
            render: (r: PayItemType) => (
              <button type="button" class="text-brand-700 hover:underline" onClick={() => void toggleActive(r)}>
                {r.is_active ? "Active" : "Inactive"}
              </button>
            ),
          },
        ]}
        rows={list.data ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={() => {}}
        onNew={() => {}}
        showNew={false}
        codeKey="item_code"
        nameKey="item_name"
        page={1}
        pageSize={200}
        total={(list.data ?? []).length}
      />
      <Show when={(list.data ?? []).length === 0 && !list.isFetching}>
        <p class="mt-3 text-sm text-text-secondary">
          No items yet. Run migration 174 to seed common allowances/deductions, or add your own above.
        </p>
      </Show>
    </HrLayout>
  );
}
