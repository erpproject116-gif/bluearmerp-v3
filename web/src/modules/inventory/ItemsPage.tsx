import { createSignal, For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { apiFetch } from "../../shared/api";
import { DecimalInput } from "../../shared/DecimalInput";
import { formatAmount, parseNum } from "../../shared/money";
import {
  emptyPriceLevels,
  emptySafetyStockByDoc,
  PRICE_LEVEL_KEYS,
  SAFETY_DOC_TYPES,
  TRACKING_POLICY_OPTIONS,
} from "../../shared/itemMasterConstants";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import { CustomFieldsSection, validateCustomFields } from "../../shared/CustomFieldsSection";
import { INVENTORY_ENTITY, INVENTORY_SETTINGS_HREF } from "../../shared/entityTypes";
import { ModalField } from "../../shared/ModalField";
import { useCustomValues } from "../../shared/useCustomValues";
import { requireFields, submitEntity } from "../../shared/handleSaveResult";
import { useToast } from "../../shared/toast";
import { buildRequiredChecks, useFormFieldSettings } from "../../shared/useFormFieldSettings";
import { useInventoryList, useInvalidateInventoryList } from "../../shared/useInventoryList";
import { useListState } from "../../shared/useListState";

type Item = {
  id: number;
  item_code: string;
  item_name: string;
  purchase_price: number;
  sales_price: number;
  vip_price: number;
  price_levels?: Record<string, number>;
  safety_stock_by_doc?: Record<string, number>;
  warranty_duration_months?: number | null;
  reorder_level?: number | null;
  track_serial?: boolean;
  track_lot?: boolean;
  serial_policy?: string;
  lot_policy?: string;
  track_inventory_qty?: boolean;
  status: string;
  custom_values?: Record<string, unknown>;
};

export default function ItemsPage() {
  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } = useListState("item_code");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [itemTab, setItemTab] = createSignal<"default" | "prices" | "serial_lot" | "management">("default");
  const [editing, setEditing] = createSignal<Item | null>(null);
  const [nextCode, setNextCode] = createSignal("");
  const [form, setForm] = createSignal({
    item_name: "",
    purchase_price: 0,
    sales_price: 0,
    vip_price: 0,
    price_levels: emptyPriceLevels(),
    safety_stock_by_doc: emptySafetyStockByDoc(),
    warranty_duration_months: null as number | null,
    reorder_level: null as number | null,
    track_serial: false,
    track_lot: false,
    serial_policy: "required",
    lot_policy: "required",
    track_inventory_qty: false,
    status: "active",
  });
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const invalidate = useInvalidateInventoryList();
  const { customValues, setCustom, loadCustom } = useCustomValues();
  const { byKey, fields, activeCustomFields } = useFormFieldSettings(INVENTORY_ENTITY.items);

  const list = useInventoryList<Item>("items", () => ({
    page: page(),
    pageSize,
    sort: sort(),
    order: order(),
    q: q() || undefined,
    status: statusFilter() || undefined,
  }));

  const openNew = async () => {
    const res = await apiFetch<{ next_code: string }>("/api/v1/inventory/items/next-code");
    setNextCode(res.data?.next_code ?? "-----");
    setEditing(null);
    setForm({
      item_name: "",
      purchase_price: 0,
      sales_price: 0,
      vip_price: 0,
      price_levels: emptyPriceLevels(),
      safety_stock_by_doc: emptySafetyStockByDoc(),
      warranty_duration_months: null,
      reorder_level: null,
      track_serial: false,
      track_lot: false,
      serial_policy: "required",
      lot_policy: "required",
      track_inventory_qty: false,
      status: "active",
    });
    loadCustom({});
    setModalOpen(true);
  };

  const openEdit = (row: Item) => {
    setEditing(row);
    setNextCode(row.item_code);
    setForm({
      item_name: row.item_name,
      purchase_price: row.purchase_price,
      sales_price: row.sales_price,
      vip_price: row.vip_price,
      price_levels: { ...emptyPriceLevels(), ...(row.price_levels ?? {}) },
      safety_stock_by_doc: {
        ...emptySafetyStockByDoc(),
        ...Object.fromEntries(
          Object.entries(row.safety_stock_by_doc ?? {}).map(([k, v]) => [k, v ?? null]),
        ),
      },
      warranty_duration_months: row.warranty_duration_months ?? null,
      reorder_level: row.reorder_level ?? null,
      track_serial: row.track_serial ?? false,
      track_lot: row.track_lot ?? false,
      serial_policy: row.serial_policy ?? "required",
      lot_policy: row.lot_policy ?? "required",
      track_inventory_qty: row.track_inventory_qty ?? false,
      status: row.status,
    });
    loadCustom(row.custom_values ?? {});
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
    const payload = {
      ...form(),
      price_levels: Object.fromEntries(
        PRICE_LEVEL_KEYS.map((k): [string, number] => [k, Number(form().price_levels[k]) || 0]).filter(([, v]) => v > 0),
      ),
      safety_stock_by_doc: Object.fromEntries(
        SAFETY_DOC_TYPES.map((d) => {
          const v = form().safety_stock_by_doc[d.key];
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

  return (
    <div>
      <SpreadsheetGrid
        columns={[
          { key: "item_code", header: "Code", clickable: true },
          { key: "item_name", header: "Name", clickable: true },
          { key: "purchase_price", header: "Purchase", render: (r) => formatAmount(r.purchase_price) },
          { key: "sales_price", header: "Sales", render: (r) => formatAmount(r.sales_price) },
          { key: "vip_price", header: "VIP", render: (r) => formatAmount(r.vip_price) },
          { key: "warranty_duration_months", header: "Warranty (mo)", render: (r) => r.warranty_duration_months ?? "—" },
          { key: "reorder_level", header: "Reorder", render: (r) => (r.reorder_level != null ? r.reorder_level : "—") },
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
      />
      <EntityModal open={modalOpen()} title={editing() ? "Edit item" : "New item"} onClose={() => { setModalOpen(false); setItemTab("default"); }} onSave={() => void save()} saving={saving()}>
        <div class="col-span-full mb-3 flex flex-wrap gap-2 border-b border-stroke pb-3">
          {(["default", "prices", "serial_lot", "management"] as const).map((tab) => (
            <button
              type="button"
              class={`rounded-lg px-3 py-1.5 text-sm ${itemTab() === tab ? "bg-brand-600 text-white" : "border border-stroke text-text-secondary"}`}
              onClick={() => setItemTab(tab)}
            >
              {tab === "default" ? "Default" : tab === "prices" ? "Qty / Price" : tab === "serial_lot" ? "Serial / Lot" : "Management"}
            </button>
          ))}
        </div>
        <Show when={itemTab() === "default"}>
        <Field label="Item code"><input class={inputClass} value={nextCode()} readOnly /></Field>
        <ModalField settings={byKey} fieldKey="item_name" fallbackLabel="Item name" fallbackRequired>
          {(m) => (
            <input
              class={inputClass}
              value={form().item_name}
              disabled={m.disabled}
              onInput={(e) => setForm((f) => ({ ...f, item_name: e.currentTarget.value }))}
            />
          )}
        </ModalField>
        </Show>
        <Show when={itemTab() === "prices"}>
        <ModalField settings={byKey} fieldKey="purchase_price" fallbackLabel="Purchase price">
          {(m) => (
            <DecimalInput
              class={inputClass}
              disabled={m.disabled}
              value={String(form().purchase_price)}
              onValue={(v) => setForm((f) => ({ ...f, purchase_price: parseNum(v) }))}
            />
          )}
        </ModalField>
        <ModalField settings={byKey} fieldKey="sales_price" fallbackLabel="Sales price">
          {(m) => (
            <DecimalInput
              class={inputClass}
              disabled={m.disabled}
              value={String(form().sales_price)}
              onValue={(v) => setForm((f) => ({ ...f, sales_price: parseNum(v) }))}
            />
          )}
        </ModalField>
        <ModalField settings={byKey} fieldKey="vip_price" fallbackLabel="VIP price">
          {(m) => (
            <DecimalInput
              class={inputClass}
              disabled={m.disabled}
              value={String(form().vip_price)}
              onValue={(v) => setForm((f) => ({ ...f, vip_price: parseNum(v) }))}
            />
          )}
        </ModalField>
        <p class="col-span-full text-sm font-medium text-text-primary">Price levels B–J</p>
        <For each={PRICE_LEVEL_KEYS}>
          {(level) => (
            <Field label={`Price ${level}`}>
              <DecimalInput
                class={inputClass}
                value={form().price_levels[level] ? String(form().price_levels[level]) : ""}
                onValue={(v) =>
                  setForm((f) => ({
                    ...f,
                    price_levels: { ...f.price_levels, [level]: v === "" ? 0 : parseNum(v) },
                  }))
                }
              />
            </Field>
          )}
        </For>
        <p class="col-span-full text-xs text-text-secondary">
          Partner-specific rates use <A href="/app/inventory/price-lists" class="text-brand-600 hover:underline">Price lists</A> assigned on the customer or vendor master.
        </p>
        <ModalField settings={byKey} fieldKey="reorder_level" fallbackLabel="Default reorder level">
          {(m) => (
            <DecimalInput
              mode="qty"
              class={inputClass}
              placeholder="Not set"
              disabled={m.disabled}
              value={form().reorder_level == null ? "" : String(form().reorder_level)}
              onValue={(v) =>
                setForm((f) => ({
                  ...f,
                  reorder_level: v === "" ? null : parseNum(v),
                }))
              }
            />
          )}
        </ModalField>
        <p class="col-span-full mt-2 text-sm font-medium text-text-primary">Safety stock by document type</p>
        <p class="col-span-full text-xs text-text-secondary">
          Optional thresholds per doc type; falls back to default reorder level when blank.
        </p>
        <For each={SAFETY_DOC_TYPES}>
          {(doc) => (
            <Field label={doc.label}>
              <DecimalInput
                mode="qty"
                class={inputClass}
                placeholder="Use default"
                value={
                  form().safety_stock_by_doc[doc.key] == null
                    ? ""
                    : String(form().safety_stock_by_doc[doc.key])
                }
                onValue={(v) =>
                  setForm((f) => ({
                    ...f,
                    safety_stock_by_doc: {
                      ...f.safety_stock_by_doc,
                      [doc.key]: v === "" ? null : parseNum(v),
                    },
                  }))
                }
              />
            </Field>
          )}
        </For>
        </Show>
        <Show when={itemTab() === "serial_lot"}>
        <Field label="Tracking mode">
          <div class="flex flex-wrap gap-6 text-sm">
            <label class="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form().track_serial}
                onChange={(e) => {
                  const checked = e.currentTarget.checked;
                  setForm((f) => ({
                    ...f,
                    track_serial: checked,
                    track_lot: checked ? false : f.track_lot,
                  }));
                }}
              />
              Track serial numbers
            </label>
            <label class="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form().track_lot}
                onChange={(e) => {
                  const checked = e.currentTarget.checked;
                  setForm((f) => ({
                    ...f,
                    track_lot: checked,
                    track_serial: checked ? false : f.track_serial,
                  }));
                }}
              />
              Track lot numbers
            </label>
          </div>
        </Field>
        <Show when={form().track_serial}>
          <Field label="Serial capture policy">
            <select
              class={inputClass}
              value={form().serial_policy}
              onChange={(e) => setForm((f) => ({ ...f, serial_policy: e.currentTarget.value }))}
            >
              {TRACKING_POLICY_OPTIONS.map((o) => (
                <option value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
        </Show>
        <Show when={form().track_lot}>
          <Field label="Lot capture policy">
            <select
              class={inputClass}
              value={form().lot_policy}
              onChange={(e) => setForm((f) => ({ ...f, lot_policy: e.currentTarget.value }))}
            >
              {TRACKING_POLICY_OPTIONS.map((o) => (
                <option value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
        </Show>
        <p class="col-span-full text-xs text-text-secondary">
          After save, open{" "}
          <A href="/app/inventory/serial-lot/registry" class="text-brand-600 hover:underline">Serial registry</A>
          {" or "}
          <A href="/app/inventory/serial-lot/lots" class="text-brand-600 hover:underline">Lot batches</A>
          {" filtered by this item."}
        </p>
        </Show>
        <Show when={itemTab() === "management"}>
        <ModalField settings={byKey} fieldKey="warranty_duration_months" fallbackLabel="Warranty (months)">
          {(m) => (
            <DecimalInput
              mode="integer"
              class={inputClass}
              placeholder="No warranty"
              disabled={m.disabled}
              value={form().warranty_duration_months == null ? "" : String(form().warranty_duration_months)}
              onValue={(v) =>
                setForm((f) => ({
                  ...f,
                  warranty_duration_months: v === "" ? null : parseNum(v),
                }))
              }
            />
          )}
        </ModalField>
        <Field label="Inventory quantity">
          <label class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form().track_inventory_qty}
              onChange={(e) => setForm((f) => ({ ...f, track_inventory_qty: e.currentTarget.checked }))}
            />
            Track inventory quantity
          </label>
        </Field>
        <ModalField settings={byKey} fieldKey="status" fallbackLabel="Status" fallbackRequired>
          {(m) => (
            <select
              class={inputClass}
              value={form().status}
              disabled={m.disabled}
              onChange={(e) => setForm((f) => ({ ...f, status: e.currentTarget.value }))}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          )}
        </ModalField>
        <CustomFieldsSection entityType={INVENTORY_ENTITY.items} values={customValues} onChange={setCustom} />
        </Show>
      </EntityModal>
    </div>
  );
}
