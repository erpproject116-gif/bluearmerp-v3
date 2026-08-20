import { createResource, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { hasPermission, useAuth } from "../../shared/auth-context";
import { useToast } from "../../shared/toast";
import { inputClass } from "../../shared/SpreadsheetGrid";
import { SalesLayout } from "./SalesLayout";

type CategoryRow = {
  id: number;
  code: string;
  name: string;
  active: boolean;
  sort_order: number;
};

function CategoryRowEdit(props: { row: CategoryRow; canWrite: boolean; onSave: (row: CategoryRow, patch: Partial<CategoryRow>) => void }) {
  const [name, setName] = createSignal(props.row.name);
  const [sortOrder, setSortOrder] = createSignal(String(props.row.sort_order));

  return (
    <tr class="border-b border-stroke">
      <td class="px-4 py-2 font-mono text-xs text-text-secondary">{props.row.code}</td>
      <td class="px-4 py-2">
        <input class={inputClass} value={name()} disabled={!props.canWrite} onInput={(e) => setName(e.currentTarget.value)} />
      </td>
      <td class="px-4 py-2">
        <input class={`${inputClass} w-20`} type="number" value={sortOrder()} disabled={!props.canWrite} onInput={(e) => setSortOrder(e.currentTarget.value)} />
      </td>
      <td class="px-4 py-2">
        <input
          type="checkbox"
          checked={props.row.active}
          disabled={!props.canWrite}
          onChange={(e) => props.onSave(props.row, { active: e.currentTarget.checked })}
        />
      </td>
      <td class="px-4 py-2">
        <Show when={props.canWrite}>
          <button
            type="button"
            class="text-sm text-brand-700 hover:underline"
            onClick={() =>
              props.onSave(props.row, {
                name: name().trim(),
                sort_order: Number(sortOrder()) || 0,
              })
            }
          >
            Save
          </button>
        </Show>
      </td>
    </tr>
  );
}

export default function SalesCategoriesPage() {
  const auth = useAuth();
  const toast = useToast();
  const canWrite = () => hasPermission(auth.me, "sales.sales_categories", "write");
  const [rows, { refetch }] = createResource(async () => {
    const res = await apiFetch<CategoryRow[]>("/api/v1/sales/categories?active=false");
    return res.data ?? [];
  });
  const [code, setCode] = createSignal("");
  const [name, setName] = createSignal("");

  const saveRow = async (row: CategoryRow, patch: Partial<CategoryRow>) => {
    const merged = { ...row, ...patch };
    const res = await apiFetch(`/api/v1/sales/categories/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: merged.name,
        active: merged.active,
        sort_order: merged.sort_order,
      }),
    });
    if (!res.success) {
      toast.warning(res.message ?? "Could not save category.");
      return;
    }
    toast.success(merged.active ? "Category saved." : "Category deactivated.");
    refetch();
  };

  const addCategory = async () => {
    if (!code().trim() || !name().trim()) {
      toast.warning("Code and name are required.");
      return;
    }
    const res = await apiFetch("/api/v1/sales/categories", {
      method: "POST",
      body: JSON.stringify({ code: code().trim(), name: name().trim(), active: true }),
    });
    if (!res.success) {
      toast.warning(res.message ?? "Could not add category.");
      return;
    }
    setCode("");
    setName("");
    refetch();
  };

  return (
    <SalesLayout>
      <h1 class="mb-1 text-xl font-semibold text-text-primary">Sales categories</h1>
      <p class="mb-4 text-sm text-text-secondary">
        Tenant lookup values used on sales invoices (replaces hardcoded general/returns).
      </p>
      <div class="overflow-hidden rounded-xl border border-stroke bg-white">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-stroke bg-slate-50 text-text-secondary">
            <tr>
              <th class="px-4 py-2.5">Code</th>
              <th class="px-4 py-2.5">Name</th>
              <th class="px-4 py-2.5">Order</th>
              <th class="px-4 py-2.5">Active</th>
              <th class="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            <For each={rows() ?? []}>{(row) => <CategoryRowEdit row={row} canWrite={canWrite()} onSave={saveRow} />}</For>
          </tbody>
        </table>
      </div>
      <Show when={canWrite()}>
        <div class="mt-4 rounded-xl border border-stroke bg-white p-4">
          <h2 class="mb-3 text-sm font-semibold">Add category</h2>
          <div class="flex flex-wrap gap-3">
            <input class={inputClass} placeholder="Code" value={code()} onInput={(e) => setCode(e.currentTarget.value)} />
            <input class={inputClass} placeholder="Name" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
            <button type="button" class="rounded-lg bg-brand px-4 py-2 text-sm text-white" onClick={() => void addCategory()}>
              Add
            </button>
          </div>
        </div>
      </Show>
    </SalesLayout>
  );
}
