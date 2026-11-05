import { createMemo, createSignal, For, Show } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";
import { HrPayrollTabs } from "./HrPayrollTabs";
import { HrBadge, HrEmpty, HrPageHead, HrTcard, type HrBadgeTone } from "./HrUi";

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

function kindLabel(row: PayItemType) {
  if (row.is_system && row.item_kind === "deduction") return "Statutory deduction";
  if (row.item_kind === "earning") return "Earning";
  if (row.item_kind === "deduction") return "Deduction";
  return row.item_kind;
}

function taxLabel(row: PayItemType) {
  if (row.item_kind !== "earning") return "—";
  return row.is_taxable ? "Taxable" : "De minimis (non-taxable)";
}

export default function PayItemsPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [kind, setKind] = createSignal("");
  const [search, setSearch] = createSignal("");
  const [code, setCode] = createSignal("");
  const [name, setName] = createSignal("");
  const [itemKind, setItemKind] = createSignal("earning");
  const [taxable, setTaxable] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [open, setOpen] = createSignal(false);
  const [editRow, setEditRow] = createSignal<PayItemType | null>(null);

  const list = createQuery(() => ({
    queryKey: ["hr-pay-item-types"],
    queryFn: async () => {
      const qs = new URLSearchParams({ page: "1", pageSize: "200" });
      const res = await apiFetch<PayItemType[]>(`/api/v1/hr/pay-item-types?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load");
      return res.data ?? [];
    },
  }));

  const rows = createMemo(() => {
    const q = search().trim().toLowerCase();
    return (list.data ?? []).filter((row) => {
      if (kind() === "earning" && row.item_kind !== "earning") return false;
      if (kind() === "deduction" && !(row.item_kind === "deduction" && !row.is_system)) return false;
      if (kind() === "statutory" && !(row.item_kind === "deduction" && row.is_system)) return false;
      if (!q) return true;
      return row.item_code.toLowerCase().includes(q) || row.item_name.toLowerCase().includes(q);
    });
  });

  const create = async () => {
    if (!code().trim() || !name().trim()) return toast.warning("Code and name are required.");
    setSaving(true);
    const res = await apiFetch<PayItemType>("/api/v1/hr/pay-item-types", {
      method: "POST",
      body: JSON.stringify({
        item_code: code().trim(),
        item_name: name().trim(),
        item_kind: itemKind(),
        is_taxable: itemKind() === "earning" ? taxable() : false,
      }),
    });
    setSaving(false);
    if (!res.success) return toast.warning(res.message ?? "Create failed.");
    toast.success("Pay item created.");
    setCode("");
    setName("");
    setOpen(false);
    void qc.invalidateQueries({ queryKey: ["hr-pay-item-types"] });
  };

  const saveEdit = async () => {
    const row = editRow();
    if (!row) return;
    if (!name().trim()) return toast.warning("Name is required.");
    setSaving(true);
    const res = await apiFetch(`/api/v1/hr/pay-item-types/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        item_name: name().trim(),
        is_taxable: row.item_kind === "earning" ? taxable() : false,
      }),
    });
    setSaving(false);
    if (!res.success) return toast.warning(res.message ?? "Update failed.");
    toast.success("Pay item updated.");
    setEditRow(null);
    void qc.invalidateQueries({ queryKey: ["hr-pay-item-types"] });
  };

  const toggleActive = async (row: PayItemType) => {
    const res = await apiFetch(`/api/v1/hr/pay-item-types/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: !row.is_active }),
    });
    if (!res.success) return toast.warning(res.message ?? "Update failed.");
    toast.success(row.is_active ? "Deactivated." : "Activated.");
    void qc.invalidateQueries({ queryKey: ["hr-pay-item-types"] });
  };

  return (
    <HrLayout>
      <HrPayrollTabs />
      <HrPageHead
        title="Pay items"
        subtitle="Earnings and deductions used by payroll."
        actions={
          <button
            type="button"
            class="hr-btn hr-btn-primary"
            onClick={() => {
              setCode("");
              setName("");
              setItemKind("earning");
              setTaxable(true);
              setOpen(true);
            }}
          >
            + New pay item
          </button>
        }
      />

      <section class="hr-w s12 mb-3" aria-label="Statutory packages">
        <header>
          <h3>Statutory packages in use</h3>
        </header>
        <div class="flex flex-wrap gap-2 p-3">
          <HrBadge tone="brand">SSS / PhilHealth / Pag-IBIG / BIR</HrBadge>
          <span class="hr-muted text-sm">
            Package codes on this card — payroll uses the statutory tables for the period end date.
          </span>
        </div>
      </section>

      <HrTcard
        toolbar={
          <>
            <input
              class="grow rounded-lg border border-stroke bg-surface px-3 py-2 text-sm"
              placeholder="Search code or name…"
              aria-label="Search"
              value={search()}
              onInput={(e) => setSearch(e.currentTarget.value)}
            />
            <select
              class="rounded-lg border border-stroke bg-surface px-2 text-sm"
              aria-label="Kind"
              value={kind()}
              onChange={(e) => setKind(e.currentTarget.value)}
            >
              <option value="">Kind: All</option>
              <option value="earning">Earning</option>
              <option value="deduction">Deduction</option>
              <option value="statutory">Statutory deduction</option>
            </select>
          </>
        }
      >
        <div class="hr-tbl-wrap">
          <table class="hr-tbl">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Kind</th>
                <th>Tax treatment</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              <For
                each={rows()}
                fallback={
                  <tr>
                    <td colspan="6">
                      <HrEmpty title="No matches" hint="Try a different search or clear the filters." />
                    </td>
                  </tr>
                }
              >
                {(row) => (
                  <tr>
                    <td>
                      <code class="text-sm">{row.item_code}</code>
                    </td>
                    <td>{row.item_name}</td>
                    <td>
                      <HrBadge tone="neutral">{kindLabel(row)}</HrBadge>
                    </td>
                    <td>{taxLabel(row)}</td>
                    <td>
                      <HrBadge tone={(row.is_active ? "success" : "neutral") as HrBadgeTone}>
                        {row.is_active ? "Active" : "Inactive"}
                      </HrBadge>
                    </td>
                    <td>
                      <details class="hr-menu hr-rowmenu">
                        <summary class="hr-rowmenu-btn" aria-label="Row actions">
                          ⋯
                        </summary>
                        <div>
                          <button
                            type="button"
                            class="menu-item"
                            onClick={() => {
                              setEditRow(row);
                              setName(row.item_name);
                              setTaxable(row.is_taxable);
                            }}
                          >
                            Edit
                          </button>
                          <button type="button" class="menu-item" onClick={() => void toggleActive(row)}>
                            {row.is_active ? "Deactivate" : "Activate"}
                          </button>
                        </div>
                      </details>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </HrTcard>

      <Show when={open()}>
        <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="New pay item">
          <div class="w-full max-w-md rounded-lg border border-stroke bg-surface p-4 shadow-lg">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold">New pay item</h2>
              <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>
            <div class="grid gap-3">
              <Field label="Code">
                <input class={inputClass} value={code()} onInput={(e) => setCode(e.currentTarget.value)} placeholder="ALLOW_RICE" />
              </Field>
              <Field label="Name">
                <input class={inputClass} value={name()} onInput={(e) => setName(e.currentTarget.value)} />
              </Field>
              <Field label="Kind">
                <select class={inputClass} value={itemKind()} onChange={(e) => setItemKind(e.currentTarget.value)}>
                  <option value="earning">Earning</option>
                  <option value="deduction">Deduction</option>
                </select>
              </Field>
              <Show when={itemKind() === "earning"}>
                <label class="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={taxable()} onChange={(e) => setTaxable(e.currentTarget.checked)} />
                  Taxable
                </label>
              </Show>
            </div>
            <div class="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" class="hr-btn" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="button" class="hr-btn hr-btn-primary" disabled={saving()} onClick={() => void create()}>
                Save
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={editRow()}>
        {(row) => (
          <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="Edit pay item">
            <div class="w-full max-w-md rounded-lg border border-stroke bg-surface p-4 shadow-lg">
              <div class="mb-3 flex items-center justify-between gap-2">
                <h2 class="text-sm font-semibold">Edit · {row().item_code}</h2>
                <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setEditRow(null)}>
                  ✕
                </button>
              </div>
              <Field label="Name">
                <input class={inputClass} value={name()} onInput={(e) => setName(e.currentTarget.value)} />
              </Field>
              <Show when={row().item_kind === "earning"}>
                <label class="mt-3 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={taxable()} onChange={(e) => setTaxable(e.currentTarget.checked)} />
                  Taxable
                </label>
              </Show>
              <div class="mt-4 flex flex-wrap justify-end gap-2">
                <button type="button" class="hr-btn" onClick={() => setEditRow(null)}>
                  Cancel
                </button>
                <button type="button" class="hr-btn hr-btn-primary" disabled={saving()} onClick={() => void saveEdit()}>
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>
    </HrLayout>
  );
}
