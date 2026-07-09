import { createSignal, onMount } from "solid-js";
import { apiFetch } from "../../shared/api";
import { formatAmount } from "../../shared/money";
import { PRICE_LEVEL_KEYS, SAFETY_DOC_TYPES } from "../../shared/itemMasterConstants";
import { SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { validateCustomFields } from "../../shared/CustomFieldsSection";
import { requireFields, submitEntity } from "../../shared/handleSaveResult";
import { useToast } from "../../shared/toast";
import { buildRequiredChecks, useFormFieldSettings } from "../../shared/useFormFieldSettings";
import { useInventoryList, useInvalidateInventoryList } from "../../shared/useInventoryList";
import { useListState } from "../../shared/useListState";
import { useCustomValues } from "../../shared/useCustomValues";
import { INVENTORY_ENTITY, INVENTORY_SETTINGS_HREF } from "../../shared/entityTypes";
import {
  ItemMasterModal,
  emptyItemForm,
  type ItemCategory,
  type ItemFormState,
  type ItemTab,
} from "./ItemMasterModal";
import { ItemsAdvancedSearch, emptyItemsAdvancedFilters, type ItemsAdvancedFilters } from "./ItemsAdvancedSearch";
import { downloadReportCsv } from "../../shared/reports/downloadReportCsv";

type Item = {
  id: number;
  item_code: string;
  item_name: string;
  spec_name?: string;
  unit?: string;
  item_category?: string;
  item_type?: string;
  production_process?: string | null;
  purchase_price: number;
  sales_price: number;
  vip_price: number;
  price_levels?: Record<string, number>;
  safety_stock_by_doc?: Record<string, number>;
  oe_price?: number;
  standard_costs?: Record<string, number>;
  warranty_duration_months?: number | null;
  reorder_level?: number | null;
  track_serial?: boolean;
  track_lot?: boolean;
  serial_policy?: string;
  lot_policy?: string;
  track_inventory_qty?: boolean;
  status: string;
  item_category_id?: number | null;
  item_category_name?: string;
  custom_values?: Record<string, unknown>;
};

function itemsExportUrl(params: Record<string, string | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) qs.set(k, v);
  }
  return `/api/v1/inventory/items/export?${qs}`;
}

function rowToForm(row: Item): ItemFormState {
  return {
    item_name: row.item_name,
    spec_name: row.spec_name ?? "",
    unit: row.unit ?? "",
    item_category: row.item_category ?? "merchandise",
    item_type: row.item_type ?? "item",
    production_process: row.production_process ?? "",
    item_category_id: row.item_category_id ?? null,
    purchase_price: row.purchase_price,
    sales_price: row.sales_price,
    vip_price: row.vip_price,
    price_levels: { ...emptyItemForm().price_levels, ...(row.price_levels ?? {}) },
    safety_stock_by_doc: {
      ...emptyItemForm().safety_stock_by_doc,
      ...Object.fromEntries(Object.entries(row.safety_stock_by_doc ?? {}).map(([k, v]) => [k, v ?? null])),
    },
    oe_price: row.oe_price ?? 0,
    standard_costs: {
      material: row.standard_costs?.material ?? 0,
      labor: row.standard_costs?.labor ?? 0,
      expenses: row.standard_costs?.expenses ?? 0,
      overhead: row.standard_costs?.overhead ?? 0,
    },
    warranty_duration_months: row.warranty_duration_months ?? null,
    reorder_level: row.reorder_level ?? null,
    track_serial: row.track_serial ?? false,
    track_lot: row.track_lot ?? false,
    serial_policy: row.serial_policy ?? "required",
    lot_policy: row.lot_policy ?? "required",
    track_inventory_qty: row.track_inventory_qty ?? false,
    status: row.status,
  };
}

export default function ItemsPage() {
  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } = useListState("item_code");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [itemTab, setItemTab] = createSignal<ItemTab>("default");
  const [editing, setEditing] = createSignal<Item | null>(null);
  const [nextCode, setNextCode] = createSignal("");
  const [form, setForm] = createSignal<ItemFormState>(emptyItemForm());
  const [categories, setCategories] = createSignal<ItemCategory[]>([]);
  const [advancedOpen, setAdvancedOpen] = createSignal(false);
  const [advancedFilters, setAdvancedFilters] = createSignal<ItemsAdvancedFilters>(emptyItemsAdvancedFilters());
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const invalidate = useInvalidateInventoryList();
  const { customValues, setCustom, loadCustom } = useCustomValues();
  const { byKey, fields, activeCustomFields } = useFormFieldSettings(INVENTORY_ENTITY.items);

  const list = useInventoryList<Item>("items", () => {
    const adv = advancedFilters();
    return {
      page: page(),
      pageSize,
      sort: sort(),
      order: order(),
      q: q() || undefined,
      status: statusFilter() || undefined,
      item_code: adv.item_code,
      item_name: adv.item_name,
      spec_name: adv.spec_name,
      item_category: adv.item_category,
      item_type: adv.item_type,
      track_serial: adv.track_serial || undefined,
      track_lot: adv.track_lot || undefined,
    };
  });

  onMount(() => {
    void apiFetch<ItemCategory[]>("/api/v1/inventory/item-categories").then((res) => {
      setCategories(res.data ?? []);
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F3") {
        e.preventDefault();
        setAdvancedOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const openNew = async () => {
    const res = await apiFetch<{ next_code: string }>("/api/v1/inventory/items/next-code");
    setNextCode(res.data?.next_code ?? "-----");
    setEditing(null);
    setForm(emptyItemForm());
    loadCustom({});
    setItemTab("default");
    setModalOpen(true);
  };

  const openEdit = (row: Item) => {
    setEditing(row);
    setNextCode(row.item_code);
    setForm(rowToForm(row));
    loadCustom(row.custom_values ?? {});
    setItemTab("default");
    setModalOpen(true);
  };

  const save = async () => {
    const ed = editing();
    const clientError =
      requireFields(form(), buildRequiredChecks(fields())) ??
      validateCustomFields(customValues(), activeCustomFields());
    if (clientError) {
      toast.warning(clientError);
      return;
    }

    setSaving(true);
    const f = form();
    const payload = {
      ...f,
      spec_name: f.spec_name || null,
      unit: f.unit || null,
      item_category: f.item_category || "merchandise",
      item_type: f.item_type || "item",
      production_process: f.production_process || null,
      price_levels: Object.fromEntries(
        PRICE_LEVEL_KEYS.map((k): [string, number] => [k, Number(f.price_levels[k]) || 0]).filter(([, v]) => v > 0),
      ),
      safety_stock_by_doc: Object.fromEntries(
        SAFETY_DOC_TYPES.map((d) => {
          const v = f.safety_stock_by_doc[d.key];
          return v != null && v > 0 ? [d.key, v] : null;
        }).filter(Boolean) as [string, number][],
      ),
      custom_values: customValues(),
    };
    const ok = await submitEntity(
      () =>
        ed
          ? apiFetch(`/api/v1/inventory/items/${ed.id}`, { method: "PATCH", body: JSON.stringify(payload) }, { silent: true })
          : apiFetch("/api/v1/inventory/items", { method: "POST", body: JSON.stringify(payload) }, { silent: true }),
      toast,
      ed ? "Item updated." : "Item created.",
    );
    setSaving(false);
    if (!ok) return;
    setModalOpen(false);
    invalidate("items");
  };

  const exportItems = () => {
    const adv = advancedFilters();
    void downloadReportCsv(
      itemsExportUrl({
        q: q() || undefined,
        status: statusFilter() || undefined,
        sort: sort(),
        order: order(),
        item_code: adv.item_code,
        item_name: adv.item_name,
        spec_name: adv.spec_name,
        item_category: adv.item_category,
        item_type: adv.item_type,
        track_serial: adv.track_serial || undefined,
        track_lot: adv.track_lot || undefined,
      }),
      "items-export.csv",
    );
  };

  return (
    <div>
      <SpreadsheetGrid
        columns={[
          { key: "item_code", header: "Code", clickable: true },
          { key: "item_name", header: "Name", clickable: true },
          { key: "spec_name", header: "Spec", render: (r) => r.spec_name || "—" },
          { key: "item_category_name", header: "Category", render: (r) => r.item_category_name || r.item_category || "—" },
          { key: "purchase_price", header: "Purchase", render: (r) => formatAmount(r.purchase_price) },
          { key: "sales_price", header: "Sales", render: (r) => formatAmount(r.sales_price) },
          { key: "vip_price", header: "VIP", render: (r) => formatAmount(r.vip_price) },
          { key: "track_serial", header: "Serial", render: (r) => (r.track_serial ? "Yes" : "—") },
          { key: "track_lot", header: "Lot", render: (r) => (r.track_lot ? "Yes" : "—") },
          { key: "status", header: "Status" },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={openEdit}
        onNew={() => void openNew()}
        codeKey="item_code"
        nameKey="item_name"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        page={page()}
        pageSize={pageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        search={q()}
        onSearchChange={setQ}
        searchPlaceholder="Search by code or name…"
        status={statusFilter()}
        onStatusChange={setStatusFilter}
        itemsCsvImport
        onImportComplete={() => invalidate("items")}
        settingsHref={INVENTORY_SETTINGS_HREF.items}
        toolbarExtra={
          <>
            <button
              type="button"
              class="rounded-lg border border-stroke px-3 py-2 text-sm font-medium text-text-secondary hover:erp-panel"
              onClick={() => setAdvancedOpen(true)}
            >
              Advanced (F3)
            </button>
            <button
              type="button"
              class="rounded-lg border border-stroke px-3 py-2 text-sm font-medium text-text-secondary hover:erp-panel"
              onClick={exportItems}
            >
              Export CSV
            </button>
          </>
        }
      />
      <ItemMasterModal
        open={modalOpen()}
        editing={Boolean(editing())}
        nextCode={nextCode()}
        itemTab={itemTab()}
        setItemTab={setItemTab}
        form={form}
        setForm={setForm}
        categories={categories()}
        byKey={byKey}
        customValues={customValues}
        setCustom={setCustom}
        saving={saving()}
        onClose={() => {
          setModalOpen(false);
          setItemTab("default");
        }}
        onSave={() => void save()}
      />
      <ItemsAdvancedSearch
        open={advancedOpen()}
        initial={advancedFilters()}
        onClose={() => setAdvancedOpen(false)}
        onApply={(f) => {
          setAdvancedFilters(f);
          setPage(1);
        }}
        onClear={() => {
          setAdvancedFilters(emptyItemsAdvancedFilters());
          setPage(1);
        }}
      />
    </div>
  );
}
