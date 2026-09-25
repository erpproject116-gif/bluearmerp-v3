import { createSignal, For } from "solid-js";
import { apiFetch } from "../../shared/api";
import { LookupCombo, type LookupOption } from "../../shared/LookupCombo";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import { ActivityHistoryLink } from "../../shared/ActivityHistoryLink";
import { RecordHistoryButton } from "../../shared/RecordHistoryButton";
import { useToast } from "../../shared/toast";
import { useInventoryList, useInvalidateInventoryList } from "../../shared/useInventoryList";
import { useListState } from "../../shared/useListState";

type ProductBundleLine = {
  id?: number;
  line_no: number;
  component_item_id: number;
  component_code?: string;
  component_name?: string;
  qty: number;
};

type ProductBundle = {
  id: number;
  bundle_code: string;
  bundle_name: string;
  parent_item_id?: number | null;
  parent_item_name?: string;
  is_active: boolean;
  components?: string;
  lines?: ProductBundleLine[];
};

async function fetchItems(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active", sort: "item_code", order: "asc" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; item_code: string; item_name: string }[]>(`/api/v1/inventory/items?${qs}`);
  return (res.data ?? []).map((i) => ({ id: i.id, label: `${i.item_code} — ${i.item_name}` }));
}

function emptyLine(): ProductBundleLine {
  return { line_no: 1, component_item_id: 0, qty: 1 };
}

export default function ProductBundlesPage() {
  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize, setPageSize } = useListState("bundle_code");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<ProductBundle | null>(null);
  const [bundleCode, setBundleCode] = createSignal("");
  const [bundleName, setBundleName] = createSignal("");
  const [isActive, setIsActive] = createSignal(true);
  const [parentItemId, setParentItemId] = createSignal<number | null>(null);
  const [parentItemLabel, setParentItemLabel] = createSignal("");
  const [lines, setLines] = createSignal<ProductBundleLine[]>([emptyLine()]);
  const [lineLabels, setLineLabels] = createSignal<Record<number, string>>({});
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const invalidate = useInvalidateInventoryList();

  const list = useInventoryList<ProductBundle>("product-bundles", () => ({
    page: page(),
    pageSize: pageSize(),
    sort: sort(),
    order: order(),
    q: q() || undefined,
    status: statusFilter() || undefined,
  }));

  const syncLineLabel = (idx: number, label: string) => setLineLabels((p) => ({ ...p, [idx]: label }));

  const openNew = () => {
    setEditing(null);
    setBundleCode("");
    setBundleName("");
    setIsActive(true);
    setParentItemId(null);
    setParentItemLabel("");
    setLines([emptyLine()]);
    setLineLabels({});
    setModalOpen(true);
  };

  const openEdit = async (row: ProductBundle) => {
    const res = await apiFetch<ProductBundle>(`/api/v1/inventory/product-bundles/${row.id}`);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? "Failed to load bundle.");
      return;
    }
    const detail = res.data;
    setEditing(detail);
    setBundleCode(detail.bundle_code);
    setBundleName(detail.bundle_name);
    setIsActive(detail.is_active);
    setParentItemId(detail.parent_item_id ?? null);
    setParentItemLabel(detail.parent_item_name ?? "");
    const loaded = detail.lines?.length ? detail.lines : [emptyLine()];
    setLines(loaded);
    setLineLabels(Object.fromEntries(loaded.map((ln, i) => [i, [ln.component_code, ln.component_name].filter(Boolean).join(" — ")])));
    setModalOpen(true);
  };

  const addLine = () => setLines((prev) => [...prev, { ...emptyLine(), line_no: prev.length + 1 }]);

  const removeLine = (idx: number) => {
    setLines((prev) => prev.filter((_, i) => i !== idx).map((ln, i) => ({ ...ln, line_no: i + 1 })));
    setLineLabels((prev) => {
      const next: Record<number, string> = {};
      let n = 0;
      for (const i of Object.keys(prev).map(Number).sort((a, b) => a - b)) {
        if (i === idx) continue;
        next[n++] = prev[i];
      }
      return next;
    });
  };

  const save = async () => {
    if (!bundleCode().trim() || !bundleName().trim()) {
      toast.warning("Bundle code and name are required.");
      return;
    }
    const bodyLines = lines()
      .filter((ln) => ln.component_item_id > 0 && Number(ln.qty) > 0)
      .map((ln) => ({ component_item_id: ln.component_item_id, qty: Number(ln.qty) }));
    if (bodyLines.length === 0) {
      toast.warning("Add at least one valid component line.");
      return;
    }
    const payload = {
      bundle_code: bundleCode().trim(),
      bundle_name: bundleName().trim(),
      parent_item_id: parentItemId() ?? null,
      is_active: isActive(),
      lines: bodyLines,
    };
    const ed = editing();
    setSaving(true);
    const res = await apiFetch(
      ed ? `/api/v1/inventory/product-bundles/${ed.id}` : "/api/v1/inventory/product-bundles",
      { method: ed ? "PATCH" : "POST", body: JSON.stringify(payload) },
      { silent: true },
    );
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to save bundle.");
      return;
    }
    toast.success(ed ? "Bundle updated." : "Bundle created.");
    setModalOpen(false);
    invalidate("product-bundles");
  };

  const remove = async (row: ProductBundle) => {
    if (!window.confirm(`Delete bundle ${row.bundle_code}?`)) return;
    const res = await apiFetch(`/api/v1/inventory/product-bundles/${row.id}`, { method: "DELETE" }, { silent: true });
    if (!res.success) {
      toast.warning(res.message ?? "Failed to delete bundle.");
      return;
    }
    toast.success("Bundle deleted.");
    invalidate("product-bundles");
  };

  return (
    <div>
      <SpreadsheetGrid
        columns={[
          { key: "bundle_code", header: "Bundle code", clickable: true },
          { key: "bundle_name", header: "Bundle name", clickable: true },
          { key: "parent_item_name", header: "Parent item" },
          { key: "components", header: "Components", sortable: false },
          {
            key: "is_active",
            header: "Status",
            sortable: false,
            render: (r) => (r.is_active ? "active" : "inactive"),
          },
          {
            key: "actions",
            header: "",
            sortable: false,
            render: (r) => (
              <button
                type="button"
                class="text-xs text-danger-600 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  void remove(r);
                }}
              >
                Delete
              </button>
            ),
          },
          {
            key: "history",
            header: "History",
            sortable: false,
            render: (r) => (
              <ActivityHistoryLink module="inventory" targetType="inv_product_bundle" targetId={r.id} title={`History — ${r.bundle_name}`} />
            ),
          },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={(row) => void openEdit(row)}
        onNew={openNew}
        codeKey="bundle_code"
        nameKey="bundle_name"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        page={page()}
        pageSize={pageSize()} onPageSizeChange={setPageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        search={q()}
        onSearchChange={setQ}
        searchPlaceholder="Search code or name…"
        status={statusFilter()}
        onStatusChange={setStatusFilter}
      />

      <EntityModal
        open={modalOpen()}
        title={editing() ? "Edit product bundle" : "New product bundle"}
        onClose={() => setModalOpen(false)}
        onSave={() => void save()}
        saving={saving()}
        headerActions={
          <RecordHistoryButton
            variant="button"
            targetType="inv_product_bundle"
            targetId={editing()?.id}
            title={`History — ${editing()?.bundle_name ?? "Product bundle"}`}
          />
        }
      >
        <Field label="Bundle code *">
          <input class={inputClass} value={bundleCode()} onInput={(e) => setBundleCode(e.currentTarget.value)} />
        </Field>
        <Field label="Bundle name *">
          <input class={inputClass} value={bundleName()} onInput={(e) => setBundleName(e.currentTarget.value)} />
        </Field>
        <LookupCombo
          label="Parent item"
          value={parentItemLabel}
          selectedId={parentItemId}
          onInput={setParentItemLabel}
          onSelect={(o) => {
            setParentItemId(o.id);
            setParentItemLabel(o.label);
          }}
          onClear={() => {
            setParentItemId(null);
            setParentItemLabel("");
          }}
          fetchOptions={fetchItems}
        />
        <Field label="Status">
          <select class={inputClass} value={isActive() ? "active" : "inactive"} onChange={(e) => setIsActive(e.currentTarget.value === "active")}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>

        <div class="col-span-full space-y-2">
          <div class="flex items-center justify-between">
            <p class="text-sm font-medium text-slate-700">Component lines</p>
            <button type="button" class="rounded border border-stroke px-2 py-1 text-xs text-brand-600 hover:bg-brand-50" onClick={addLine}>
              + Line
            </button>
          </div>
          <For each={lines()}>
            {(ln, idx) => (
              <div class="grid grid-cols-12 gap-2 rounded border border-stroke p-2">
                <div class="col-span-7">
                  <LookupCombo
                    label={`Component #${idx() + 1}`}
                    required
                    value={() => lineLabels()[idx()] ?? ""}
                    selectedId={() => (ln.component_item_id > 0 ? ln.component_item_id : null)}
                    onInput={(v) => syncLineLabel(idx(), v)}
                    onSelect={(o) => {
                      setLines((prev) => prev.map((x, i) => (i === idx() ? { ...x, component_item_id: o.id } : x)));
                      syncLineLabel(idx(), o.label);
                    }}
                    onClear={() => {
                      setLines((prev) => prev.map((x, i) => (i === idx() ? { ...x, component_item_id: 0 } : x)));
                      syncLineLabel(idx(), "");
                    }}
                    fetchOptions={fetchItems}
                  />
                </div>
                <label class="col-span-3 text-sm">
                  <span class="text-text-secondary">Qty</span>
                  <input
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    class={`${inputClass} mt-1`}
                    value={ln.qty}
                    onInput={(e) => setLines((prev) => prev.map((x, i) => (i === idx() ? { ...x, qty: Number(e.currentTarget.value) } : x)))}
                  />
                </label>
                <div class="col-span-2 flex items-end">
                  <button type="button" class="rounded border border-stroke px-2 py-1 text-xs text-danger-600 disabled:opacity-50" disabled={lines().length <= 1} onClick={() => removeLine(idx())}>
                    Remove
                  </button>
                </div>
              </div>
            )}
          </For>
        </div>
      </EntityModal>
    </div>
  );
}
