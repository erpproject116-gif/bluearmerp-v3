import { createSignal, onMount, Show, onCleanup } from "solid-js";
import { apiFetch } from "../../shared/api";
import { formatAmount } from "../../shared/money";
import { PRICE_LEVEL_KEYS, SAFETY_DOC_TYPES } from "../../shared/itemMasterConstants";
import { CollapsibleFilterPanel } from "../../shared/CollapsibleFilterPanel";
import { Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import { ActivityHistoryLink } from "../../shared/ActivityHistoryLink";
import {
  BulkItemTrackingModal,
  type BulkTrackingAction,
  type BulkTrackingOutcome,
} from "../../shared/BulkItemTrackingModal";
import { BulkItemEditModal } from "../../shared/BulkItemEditModal";
import { validateCustomFields } from "../../shared/CustomFieldsSection";
import { requireFields, submitEntity } from "../../shared/handleSaveResult";
import { useToast } from "../../shared/toast";
import { buildRequiredChecks, useFormFieldSettings } from "../../shared/useFormFieldSettings";
import { useInventoryList, useInvalidateInventoryList } from "../../shared/useInventoryList";
import { useListState } from "../../shared/useListState";
import { useMasterLifecycle } from "../../shared/masterLifecycle";
import { hasPermission, useAuth } from "../../shared/auth-context";
import { useCustomValues } from "../../shared/useCustomValues";
import { useDocumentDraft } from "../../shared/useDocumentDraft";
import { DRAFT_ENTITY, INVENTORY_ENTITY, INVENTORY_SETTINGS_HREF } from "../../shared/entityTypes";
import {
  ItemMasterModal,
  emptyItemForm,
  type ItemCategory,
  type ItemFormState,
  type ItemTab,
} from "./ItemMasterModal";
import { ItemBarcodeModal } from "./ItemBarcodeModal";
import { ItemsAdvancedSearch, emptyItemsAdvancedFilters, type ItemsAdvancedFilters } from "./ItemsAdvancedSearch";
import { SerialGenerateModal } from "./serial-lot/SerialGenerateModal";
import { StockAdjustmentModal } from "./StockAdjustmentModal";
import { downloadReportCsv } from "../../shared/reports/downloadReportCsv";

type Item = {
  id: number;
  item_code: string;
  item_name: string;
  spec_name?: string;
  unit?: string;
  base_unit_id?: number | null;
  base_unit_code?: string;
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
  catch_weight?: boolean;
  default_shelf_life_days?: number | null;
  lot_allocation_method?: string;
  price_basis?: string;
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
    unit: row.unit ?? row.base_unit_code ?? "",
    base_unit_id: row.base_unit_id ?? null,
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
    catch_weight: row.catch_weight ?? false,
    default_shelf_life_days: row.default_shelf_life_days ?? null,
    lot_allocation_method: row.lot_allocation_method ?? "manual",
    price_basis: row.price_basis ?? "unit",
    status: row.status,
  };
}

export default function ItemsPage() {
  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } = useListState("item_code");
  const [draftQ, setDraftQ] = createSignal("");
  const auth = useAuth();
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
  const [barcodeOpen, setBarcodeOpen] = createSignal(false);
  const [generateOpen, setGenerateOpen] = createSignal(false);
  const [trackOpen, setTrackOpen] = createSignal(false);
  const [trackAction, setTrackAction] = createSignal<BulkTrackingAction>("enable_serial");
  const [trackSubmitting, setTrackSubmitting] = createSignal(false);
  const [trackOutcome, setTrackOutcome] = createSignal<BulkTrackingOutcome | null>(null);
  const [bulkEditOpen, setBulkEditOpen] = createSignal(false);
  const [bulkEditSubmitting, setBulkEditSubmitting] = createSignal(false);
  const [moreOpen, setMoreOpen] = createSignal(false);
  const [serialLotMenuOpen, setSerialLotMenuOpen] = createSignal(false);
  const [adjustOpen, setAdjustOpen] = createSignal(false);
  const [adjustItemId, setAdjustItemId] = createSignal<number | null>(null);
  const [adjustItemLabel, setAdjustItemLabel] = createSignal("");
  const toast = useToast();
  const invalidate = useInvalidateInventoryList();
  const lifecycle = useMasterLifecycle({
    apiBase: "/api/v1/inventory/items",
    entityLabel: "item",
    canManage: () => hasPermission(auth.me, "inventory.items", "write"),
    onChanged: () => invalidate("items"),
  });
  const canManageItems = () => hasPermission(auth.me, "inventory.items", "write");
  const canBulkEdit = () => hasPermission(auth.me, "inventory.items_bulk_edit", "write");

  const openBulkTracking = (action: BulkTrackingAction) => {
    if (!canManageItems() || lifecycle.selectedIds().size === 0) return;
    setTrackAction(action);
    setTrackOutcome(null);
    setTrackOpen(true);
  };

  const submitBulkTracking = async (opts: { serial_policy?: string; lot_policy?: string }) => {
    const ids = [...lifecycle.selectedIds()];
    if (ids.length === 0) return;
    const action = trackAction();
    const body: Record<string, unknown> = { ids };
    if (action === "enable_serial") {
      body.track_serial = true;
      body.serial_policy = opts.serial_policy ?? "required";
    } else if (action === "disable_serial") {
      body.track_serial = false;
    } else if (action === "enable_lot") {
      body.track_lot = true;
      body.lot_policy = opts.lot_policy ?? "required";
    } else {
      body.track_lot = false;
    }
    setTrackSubmitting(true);
    const res = await apiFetch<BulkTrackingOutcome>("/api/v1/inventory/items/actions/bulk-tracking", {
      method: "POST",
      body: JSON.stringify(body),
    }, { silent: true });
    setTrackSubmitting(false);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? "Bulk tracking update failed.");
      return;
    }
    setTrackOutcome(res.data);
    if (res.data.updated > 0) {
      toast.success(`Tracking updated on ${res.data.updated} item(s); ${res.data.skipped} skipped.`);
      lifecycle.onSelectionChange(new Set());
      invalidate("items");
    } else {
      toast.warning("No items were updated.");
    }
  };
  const submitBulkEdit = async (patch: {
    item_name?: string;
    spec_name?: string;
    purchase_price?: number;
    sales_price?: number;
    vip_price?: number;
  }) => {
    const ids = [...lifecycle.selectedIds()];
    if (ids.length === 0) return;
    if (Object.keys(patch).length === 0) {
      toast.warning("Enter at least one field to update.");
      return;
    }
    setBulkEditSubmitting(true);
    const res = await apiFetch<{ updated: number; skipped: number }>(
      "/api/v1/inventory/items/bulk",
      { method: "PATCH", body: JSON.stringify({ ids, ...patch }) },
      { silent: true },
    );
    setBulkEditSubmitting(false);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? "Bulk edit failed.");
      return;
    }
    toast.success(`Updated ${res.data.updated} item(s); ${res.data.skipped} skipped.`);
    setBulkEditOpen(false);
    lifecycle.onSelectionChange(new Set());
    invalidate("items");
  };

  const openBulkEdit = () => {
    if (!canBulkEdit() || lifecycle.selectedIds().size === 0) return;
    setBulkEditOpen(true);
  };

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
      lifecycle: lifecycle.filter(),
      item_code: adv.item_code,
      item_name: adv.item_name,
      spec_name: adv.spec_name,
      item_category: adv.item_category,
      item_type: adv.item_type,
      track_serial: adv.track_serial || undefined,
      track_lot: adv.track_lot || undefined,
    };
  });

  const applyItemSearch = () => {
    setQ(draftQ().trim());
    setPage(1);
  };

  const resetItemFilters = () => {
    setDraftQ("");
    setQ("");
    setStatusFilter("");
    setAdvancedFilters(emptyItemsAdvancedFilters());
    setPage(1);
  };

  onMount(() => {
    setDraftQ(q());
    void apiFetch<ItemCategory[]>("/api/v1/inventory/item-categories").then((res) => {
      setCategories(res.data ?? []);
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F3") {
        e.preventDefault();
        setAdvancedOpen(true);
      }
      if (e.key === "F8") {
        e.preventDefault();
        applyItemSearch();
      }
      if (e.key === "Escape") {
        setMoreOpen(false);
        setSerialLotMenuOpen(false);
      }
    };
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-items-more-menu]")) setMoreOpen(false);
      if (!t.closest("[data-items-serial-lot-menu]")) setSerialLotMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("click", onDocClick);
    onCleanup(() => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onDocClick);
    });
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

  const draft = useDocumentDraft({
    entityType: DRAFT_ENTITY.invItem,
    draftKey: () => (editing() ? `edit-${editing()!.id}` : "new"),
    getPayload: () => ({ form: form(), custom_values: customValues() }),
    onApply: (payload) => {
      setForm(payload.form);
      loadCustom(payload.custom_values ?? {});
    },
    enabled: () => modalOpen(),
    // openNew() awaits a next-code fetch before the modal's initial state settles, so
    // autoApply could race with it — prefer the Restore banner over a silent overwrite.
  });

  const save = async () => {
    const ed = editing();
    const clientError =
      requireFields(form(), buildRequiredChecks(fields())) ??
      validateCustomFields(customValues(), activeCustomFields());
    if (clientError) {
      toast.warning(clientError);
      return;
    }
    if (!form().base_unit_id) {
      toast.warning("Base unit is required.");
      return;
    }

    setSaving(true);
    const f = form();
    const payload = {
      ...f,
      spec_name: f.spec_name || null,
      unit: f.unit || null,
      base_unit_id: f.base_unit_id || null,
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
    await draft.clearOnSave();
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

  const selectedItemsForBarcode = (): Item[] => {
    const ids = new Set(lifecycle.selectedIds());
    const rows = list.data?.rows ?? [];
    if (ids.size > 0) return rows.filter((r) => ids.has(r.id));
    const sid = selectedId();
    if (sid != null) {
      const one = rows.find((r) => r.id === sid);
      return one ? [one] : [];
    }
    return [];
  };

  const openBarcode = () => {
    if (selectedItemsForBarcode().length === 0) {
      toast.warning("Select one or more items to print barcodes.");
      return;
    }
    setBarcodeOpen(true);
  };

  const openGenerateSerials = () => {
    const pick = selectedItemsForBarcode().find((r) => r.track_serial) ?? selectedItemsForBarcode()[0];
    if (pick && !pick.track_serial) {
      toast.warning("Selected item does not track serial numbers. Choose a serial-tracked item or open Generate and pick one.");
    }
    setGenerateOpen(true);
  };

  const openStockAdjustment = () => {
    const rows = selectedItemsForBarcode();
    if (rows.length !== 1) {
      toast.warning("Select exactly one item to create a stock adjustment.");
      return;
    }
    const item = rows[0]!;
    setAdjustItemId(item.id);
    setAdjustItemLabel(`${item.item_code} — ${item.item_name}`);
    setAdjustOpen(true);
  };

  const generateInitial = () => {
    const pick = selectedItemsForBarcode().find((r) => r.track_serial);
    if (!pick) return { id: null as number | null, label: "" };
    return { id: pick.id, label: `${pick.item_code} — ${pick.item_name}` };
  };

  return (
    <div class="space-y-4">
      <CollapsibleFilterPanel
        title="Items"
        description="Search by code or name, filter by status, then Search (F8). Use Advanced (F3) for category, type, and tracking filters."
        actions={
          <>
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              onClick={applyItemSearch}
            >
              Search (F8)
            </button>
            <button
              type="button"
              class="rounded-lg border border-stroke px-4 py-2 text-sm text-text-secondary hover:bg-slate-50"
              onClick={resetItemFilters}
            >
              Reset
            </button>
            <button
              type="button"
              class="rounded-lg border border-brand-300 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
              onClick={() => setAdvancedOpen(true)}
            >
              Advanced (F3)
            </button>
          </>
        }
      >
        <div class="grid gap-4 md:grid-cols-2">
          <Field label="Keyword">
            <input
              class={inputClass}
              value={draftQ()}
              onInput={(e) => setDraftQ(e.currentTarget.value)}
              placeholder="Search by code or name…"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyItemSearch();
                }
              }}
            />
          </Field>
          <Field label="Status">
            <select
              class={inputClass}
              value={statusFilter()}
              onChange={(e) => {
                setStatusFilter(e.currentTarget.value);
                setPage(1);
              }}
            >
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
        </div>
      </CollapsibleFilterPanel>

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
          {
            key: "history",
            header: "History",
            sortable: false,
            render: (r) => (
              <ActivityHistoryLink module="inventory" targetType="inv_item" targetId={r.id} title={`History — ${r.item_code}`} />
            ),
          },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        selectable
        selectedIds={lifecycle.selectedIds()}
        onSelectionChange={lifecycle.onSelectionChange}
        onEdit={openEdit}
        onNew={() => void openNew()}
        newLabel="Add product"
        hideExport
        codeKey="item_code"
        nameKey="item_name"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        page={page()}
        pageSize={pageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        itemsCsvImport
        itemsImportExportMenu
        onExportCsv={exportItems}
        onImportComplete={() => invalidate("items")}
        settingsHref={INVENTORY_SETTINGS_HREF.items}
        toolbarExtra={
          <>
            <lifecycle.BulkToolbar />
            <Show when={canBulkEdit() && lifecycle.filter() !== "deleted"}>
              <button
                type="button"
                class="rounded-lg border border-stroke px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-40"
                disabled={lifecycle.selectedIds().size === 0}
                onClick={openBulkEdit}
              >
                Bulk edit{lifecycle.selectedIds().size > 0 ? ` (${lifecycle.selectedIds().size})` : ""}
              </button>
            </Show>
            <Show when={canManageItems() && lifecycle.filter() !== "deleted"}>
              <div class="relative" data-items-serial-lot-menu>
                <button
                  type="button"
                  class="inline-flex items-center gap-1 rounded-lg border border-stroke px-3 py-2 text-sm font-medium text-text-secondary hover:erp-panel"
                  aria-expanded={serialLotMenuOpen()}
                  aria-haspopup="menu"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSerialLotMenuOpen((v) => !v);
                  }}
                >
                  Serial / Lot actions
                  <svg class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path
                      fill-rule="evenodd"
                      d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                      clip-rule="evenodd"
                    />
                  </svg>
                </button>
                <Show when={serialLotMenuOpen()}>
                  <div
                    role="menu"
                    class="absolute right-0 z-50 mt-1 min-w-[12rem] rounded-lg border border-stroke bg-white py-1 shadow-lg"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      class="block w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-slate-50 disabled:opacity-40"
                      disabled={lifecycle.selectedIds().size === 0}
                      title="Enable Track serial numbers on selected items"
                      onClick={() => {
                        setSerialLotMenuOpen(false);
                        openBulkTracking("enable_serial");
                      }}
                    >
                      Enable serial{lifecycle.selectedIds().size > 0 ? ` (${lifecycle.selectedIds().size})` : ""}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      class="block w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-slate-50 disabled:opacity-40"
                      disabled={lifecycle.selectedIds().size === 0}
                      onClick={() => {
                        setSerialLotMenuOpen(false);
                        openBulkTracking("disable_serial");
                      }}
                    >
                      Disable serial
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      class="block w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-slate-50 disabled:opacity-40"
                      disabled={lifecycle.selectedIds().size === 0}
                      onClick={() => {
                        setSerialLotMenuOpen(false);
                        openBulkTracking("enable_lot");
                      }}
                    >
                      Enable lot
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      class="block w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-slate-50"
                      onClick={() => {
                        setSerialLotMenuOpen(false);
                        openGenerateSerials();
                      }}
                    >
                      Generate serials
                    </button>
                  </div>
                </Show>
              </div>
            </Show>
            <lifecycle.FilterControl />
            <div class="relative" data-items-more-menu>
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-lg border border-stroke px-3 py-2 text-sm font-medium text-text-secondary hover:erp-panel"
                aria-expanded={moreOpen()}
                aria-haspopup="menu"
                onClick={(e) => {
                  e.stopPropagation();
                  setMoreOpen((v) => !v);
                }}
              >
                More
                <svg class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path
                    fill-rule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>
              <Show when={moreOpen()}>
                <div
                  role="menu"
                  class="absolute right-0 z-50 mt-1 min-w-[10rem] rounded-lg border border-stroke bg-white py-1 shadow-lg"
                >
                  <button
                    type="button"
                    role="menuitem"
                    class="block w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-slate-50"
                    onClick={() => {
                      setMoreOpen(false);
                      openBarcode();
                    }}
                  >
                    Barcode (Item)
                  </button>
                </div>
              </Show>
            </div>
            <Show when={canManageItems() && lifecycle.filter() !== "deleted"}>
              <button
                type="button"
                class="rounded-lg border border-stroke px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-40"
                disabled={lifecycle.selectedIds().size !== 1}
                title="Create a stock adjustment for the selected item"
                onClick={openStockAdjustment}
              >
                Stock adjustment
              </button>
            </Show>
          </>
        }
      />
      <lifecycle.BulkDialog />
      <BulkItemEditModal
        open={bulkEditOpen()}
        count={lifecycle.selectedIds().size}
        submitting={bulkEditSubmitting()}
        onClose={() => setBulkEditOpen(false)}
        onConfirm={(patch) => void submitBulkEdit(patch)}
      />
      <BulkItemTrackingModal
        open={trackOpen()}
        action={trackAction()}
        count={lifecycle.selectedIds().size}
        submitting={trackSubmitting()}
        outcome={trackOutcome()}
        onClose={() => {
          if (trackSubmitting()) return;
          setTrackOpen(false);
          setTrackOutcome(null);
        }}
        onConfirm={(opts) => void submitBulkTracking(opts)}
      />
      <ItemBarcodeModal
        open={barcodeOpen()}
        items={selectedItemsForBarcode()}
        onClose={() => setBarcodeOpen(false)}
      />
      <SerialGenerateModal
        open={generateOpen()}
        initialItemId={generateInitial().id}
        initialItemLabel={generateInitial().label}
        onClose={() => setGenerateOpen(false)}
        onGenerated={() => {
          invalidate("items");
        }}
      />
      <StockAdjustmentModal
        open={adjustOpen()}
        initialItemId={adjustItemId()}
        initialItemLabel={adjustItemLabel()}
        onClose={() => {
          setAdjustOpen(false);
          setAdjustItemId(null);
          setAdjustItemLabel("");
        }}
        onSaved={() => {
          setAdjustOpen(false);
          setAdjustItemId(null);
          setAdjustItemLabel("");
          invalidate("items");
        }}
      />
      <ItemMasterModal
        open={modalOpen()}
        editing={Boolean(editing())}
        editingId={editing()?.id ?? null}
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
        draftBanner={<draft.DraftBanner />}
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
