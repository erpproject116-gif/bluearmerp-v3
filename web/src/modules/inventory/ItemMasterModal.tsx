import { A } from "@solidjs/router";
import { For, Show, createSignal, createEffect } from "solid-js";
import type { Accessor, JSX, Setter } from "solid-js";
import { DecimalInput } from "../../shared/DecimalInput";
import { CustomFieldsSection } from "../../shared/CustomFieldsSection";
import { INVENTORY_ENTITY } from "../../shared/entityTypes";
import { ModalField } from "../../shared/ModalField";
import {
  ITEM_CATEGORY_OPTIONS,
  ITEM_TYPE_OPTIONS,
  PRICE_LEVEL_KEYS,
  PRODUCTION_PROCESS_OPTIONS,
  SAFETY_DOC_TYPES,
  TRACKING_POLICY_OPTIONS,
  emptyPriceLevels,
  emptySafetyStockByDoc,
  emptyStandardCosts,
  type StandardCosts,
} from "../../shared/itemMasterConstants";
import { EntityModal, Field, inputClass } from "../../shared/SpreadsheetGrid";
import { ModalFormGuide } from "../../shared/ModalFormGuide";
import { RecordHistoryButton } from "../../shared/RecordHistoryButton";
import { parseNum } from "../../shared/money";
import type { FormFieldSetting } from "../../shared/useFormFieldSettings";
import { UnitLookupCombo, formatUnitLabel } from "../../shared/UnitLookupCombo";

export type ItemCategory = { id: number; code: string; name: string };

export type ItemFormState = {
  item_name: string;
  spec_name: string;
  unit: string;
  base_unit_id: number | null;
  item_category: string;
  item_type: string;
  production_process: string;
  item_category_id: number | null;
  purchase_price: number;
  sales_price: number;
  vip_price: number;
  price_levels: Record<string, number>;
  safety_stock_by_doc: Record<string, number | null>;
  oe_price: number;
  standard_costs: StandardCosts;
  warranty_duration_months: number | null;
  reorder_level: number | null;
  track_serial: boolean;
  track_lot: boolean;
  serial_policy: string;
  lot_policy: string;
  track_inventory_qty: boolean;
  status: string;
};

export const emptyItemForm = (): ItemFormState => ({
  item_name: "",
  spec_name: "",
  unit: "",
  base_unit_id: null,
  item_category: "merchandise",
  item_type: "item",
  production_process: "",
  item_category_id: null,
  purchase_price: 0,
  sales_price: 0,
  vip_price: 0,
  price_levels: emptyPriceLevels(),
  safety_stock_by_doc: emptySafetyStockByDoc(),
  oe_price: 0,
  standard_costs: emptyStandardCosts(),
  warranty_duration_months: null,
  reorder_level: null,
  track_serial: false,
  track_lot: false,
  serial_policy: "optional",
  lot_policy: "optional",
  track_inventory_qty: true,
  status: "active",
});

const TABS = [
  { id: "default", label: "Default" },
  { id: "item_info", label: "Item Information" },
  { id: "qty", label: "Qty" },
  { id: "price", label: "Price" },
  { id: "cost", label: "Cost" },
  { id: "additional", label: "Additional" },
  { id: "management", label: "Management" },
] as const;

export type ItemTab = (typeof TABS)[number]["id"];

type Props = {
  open: boolean;
  editing: boolean;
  editingId?: number | null;
  nextCode: string;
  itemTab: ItemTab;
  setItemTab: Setter<ItemTab>;
  form: Accessor<ItemFormState>;
  setForm: Setter<ItemFormState>;
  categories: ItemCategory[];
  byKey: Accessor<Record<string, FormFieldSetting>>;
  customValues: Accessor<Record<string, unknown>>;
  setCustom: (key: string, value: unknown) => void;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  draftBanner?: JSX.Element;
};

export function ItemMasterModal(props: Props) {
  const setForm = (fn: (f: ItemFormState) => ItemFormState) => props.setForm(fn(props.form()));
  const [unitLabel, setUnitLabel] = createSignal("");

  createEffect(() => {
    const f = props.form();
    if (f.base_unit_id && f.unit) {
      setUnitLabel(formatUnitLabel({ code: f.unit, name: f.unit }));
    } else if (!f.base_unit_id) {
      setUnitLabel(f.unit || "");
    }
  });

  return (
    <EntityModal
      open={props.open}
      title={props.editing ? "Edit item" : "New item"}
      onClose={props.onClose}
      onSave={props.onSave}
      saving={props.saving}
      headerActions={
        <RecordHistoryButton
          variant="button"
          targetType="inv_item"
          targetId={props.editingId}
          title={`History — ${props.nextCode || "Item"}`}
        />
      }
    >
      {props.draftBanner}
      <ModalFormGuide guideId="item_master" spanFull />
      <div class="col-span-full mb-3 flex flex-wrap gap-2 border-b border-stroke pb-3">
        <For each={TABS}>
          {(tab) => (
            <button
              type="button"
              class={`rounded-lg px-3 py-1.5 text-sm ${props.itemTab === tab.id ? "bg-brand-600 text-white" : "border border-stroke text-text-secondary"}`}
              onClick={() => props.setItemTab(tab.id)}
            >
              {tab.label}
            </button>
          )}
        </For>
      </div>

      <Show when={props.itemTab === "default"}>
        <Field label="Item code">
          <input class={inputClass} value={props.nextCode} readOnly />
        </Field>
        <ModalField settings={props.byKey} fieldKey="item_name" fallbackLabel="Item name" fallbackRequired>
          {(m) => (
            <input
              class={inputClass}
              value={props.form().item_name}
              disabled={m.disabled}
              onInput={(e) => setForm((f) => ({ ...f, item_name: e.currentTarget.value }))}
            />
          )}
        </ModalField>
        <Field label="POS / tenant category">
          <select
            class={inputClass}
            value={props.form().item_category_id ?? ""}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                item_category_id: e.currentTarget.value ? Number(e.currentTarget.value) : null,
              }))
            }
          >
            <option value="">—</option>
            <For each={props.categories}>{(c) => <option value={c.id}>{c.name}</option>}</For>
          </select>
        </Field>
        <Field label="Item category">
          <select
            class={inputClass}
            value={props.form().item_category}
            onChange={(e) => setForm((f) => ({ ...f, item_category: e.currentTarget.value }))}
          >
            <For each={ITEM_CATEGORY_OPTIONS}>{(o) => <option value={o.value}>{o.label}</option>}</For>
          </select>
        </Field>
        <Field label="Item type">
          <select
            class={inputClass}
            value={props.form().item_type}
            onChange={(e) => setForm((f) => ({ ...f, item_type: e.currentTarget.value }))}
          >
            <For each={ITEM_TYPE_OPTIONS}>{(o) => <option value={o.value}>{o.label}</option>}</For>
          </select>
        </Field>
        <Field label="Production process">
          <select
            class={inputClass}
            value={props.form().production_process}
            onChange={(e) => setForm((f) => ({ ...f, production_process: e.currentTarget.value }))}
          >
            <For each={PRODUCTION_PROCESS_OPTIONS}>{(o) => <option value={o.value}>{o.label}</option>}</For>
          </select>
        </Field>
        <ModalField settings={props.byKey} fieldKey="status" fallbackLabel="Status" fallbackRequired>
          {(m) => (
            <select
              class={inputClass}
              value={props.form().status}
              disabled={m.disabled}
              onChange={(e) => setForm((f) => ({ ...f, status: e.currentTarget.value }))}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          )}
        </ModalField>
      </Show>

      <Show when={props.itemTab === "item_info"}>
        <Field label="Spec name">
          <input
            class={inputClass}
            value={props.form().spec_name}
            onInput={(e) => setForm((f) => ({ ...f, spec_name: e.currentTarget.value }))}
          />
        </Field>
        <div>
          <UnitLookupCombo
            label="Base unit"
            selectedId={() => props.form().base_unit_id}
            value={unitLabel}
            onInput={setUnitLabel}
            onSelect={(u) => {
              setForm((f) => ({ ...f, base_unit_id: u.id, unit: u.code }));
              setUnitLabel(formatUnitLabel(u));
            }}
            onClear={() => {
              setForm((f) => ({ ...f, base_unit_id: null, unit: "" }));
              setUnitLabel("");
            }}
          />
          <p class="mt-1 text-xs text-text-secondary">
            Stock quantities use this unit. Search or type to add a custom UoM (mm, ft, roll…).{" "}
            <A href="/app/inventory/units" class="text-brand-600 hover:underline">
              Manage units & conversions
            </A>
          </p>
        </div>
        <Field label="Unit label (optional)">
          <input
            class={inputClass}
            value={props.form().unit}
            onInput={(e) => setForm((f) => ({ ...f, unit: e.currentTarget.value }))}
            placeholder="Display fallback if base unit unset"
          />
        </Field>
      </Show>

      <Show when={props.itemTab === "qty"}>
        <ModalField settings={props.byKey} fieldKey="reorder_level" fallbackLabel="Default reorder level">
          {(m) => (
            <DecimalInput
              mode="qty"
              class={inputClass}
              placeholder="Not set"
              disabled={m.disabled}
              value={props.form().reorder_level == null ? "" : String(props.form().reorder_level)}
              onValue={(v) => setForm((f) => ({ ...f, reorder_level: v === "" ? null : parseNum(v) }))}
            />
          )}
        </ModalField>

        <div class="col-span-full space-y-3 rounded-xl border border-stroke bg-slate-50/80 p-4">
          <div>
            <p class="text-sm font-semibold text-text-primary">Tracking</p>
            <p class="mt-0.5 text-xs text-text-secondary">
              Quantity tracking drives Find Stock and Stock Movements. Serial/Lot is for unit identity on Purchase Receive
              and Sales — quantity tracking should stay on when you use them.
            </p>
          </div>
          <Field label="Inventory quantity">
            <label class="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={props.form().track_inventory_qty}
                onChange={(e) => setForm((f) => ({ ...f, track_inventory_qty: e.currentTarget.checked }))}
              />
              Track inventory quantity (Find Stock &amp; movements)
            </label>
            <p class="mt-1 text-xs text-text-secondary">
              On for merchandise by default. Turn off for services / non-stock. Purchases and Sales change on-hand
              qty when this is on — they do not edit BOM recipes.
            </p>
          </Field>
          <Field label="Unit identity">
            <div class="flex flex-wrap gap-4 text-sm">
              <label class="flex items-center gap-2">
                <input
                  type="radio"
                  name="item-unit-identity"
                  checked={!props.form().track_serial && !props.form().track_lot}
                  onChange={() => setForm((f) => ({ ...f, track_serial: false, track_lot: false }))}
                />
                None
              </label>
              <label class="flex items-center gap-2">
                <input
                  type="radio"
                  name="item-unit-identity"
                  checked={props.form().track_serial}
                  onChange={() =>
                    setForm((f) => ({
                      ...f,
                      track_serial: true,
                      track_lot: false,
                      serial_policy: f.serial_policy || "optional",
                      track_inventory_qty: true,
                    }))
                  }
                />
                Serial
              </label>
              <label class="flex items-center gap-2">
                <input
                  type="radio"
                  name="item-unit-identity"
                  checked={props.form().track_lot}
                  onChange={() =>
                    setForm((f) => ({
                      ...f,
                      track_lot: true,
                      track_serial: false,
                      lot_policy: f.lot_policy || "optional",
                      track_inventory_qty: true,
                    }))
                  }
                />
                Lot
              </label>
            </div>
          </Field>
          <Show when={props.form().track_serial}>
            <Field label="Serial capture">
              <select
                class={inputClass}
                value={props.form().serial_policy}
                onChange={(e) => setForm((f) => ({ ...f, serial_policy: e.currentTarget.value }))}
              >
                <For each={TRACKING_POLICY_OPTIONS}>{(o) => <option value={o.value}>{o.label}</option>}</For>
              </select>
              <p class="mt-1 text-xs text-text-secondary">Optional = capture when available. Required = block save without serials.</p>
            </Field>
          </Show>
          <Show when={props.form().track_lot}>
            <Field label="Lot capture">
              <select
                class={inputClass}
                value={props.form().lot_policy}
                onChange={(e) => setForm((f) => ({ ...f, lot_policy: e.currentTarget.value }))}
              >
                <For each={TRACKING_POLICY_OPTIONS}>{(o) => <option value={o.value}>{o.label}</option>}</For>
              </select>
              <p class="mt-1 text-xs text-text-secondary">Optional = capture when available. Required = block save without lots.</p>
            </Field>
          </Show>
          <Show when={props.form().track_serial || props.form().track_lot}>
            <p class="text-xs text-text-secondary">
              <A href="/app/inventory/serial-lot/registry" class="text-brand-600 hover:underline">
                Serial registry
              </A>
              {" · "}
              <A href="/app/inventory/serial-lot/lots" class="text-brand-600 hover:underline">
                Lot batches
              </A>
              {" · "}
              <A href="/app/purchase-order/goods-receipt" class="text-brand-600 hover:underline">
                Purchase Receive
              </A>
            </p>
          </Show>
        </div>

        <p class="col-span-full mt-2 text-sm font-medium text-text-primary">Safety stock by document type</p>
        <For each={SAFETY_DOC_TYPES}>
          {(doc) => (
            <Field label={doc.label}>
              <DecimalInput
                mode="qty"
                class={inputClass}
                placeholder="Use default"
                value={
                  props.form().safety_stock_by_doc[doc.key] == null ? "" : String(props.form().safety_stock_by_doc[doc.key])
                }
                onValue={(v) =>
                  setForm((f) => ({
                    ...f,
                    safety_stock_by_doc: { ...f.safety_stock_by_doc, [doc.key]: v === "" ? null : parseNum(v) },
                  }))
                }
              />
            </Field>
          )}
        </For>
      </Show>

      <Show when={props.itemTab === "price"}>
        <ModalField settings={props.byKey} fieldKey="purchase_price" fallbackLabel="Purchase price">
          {(m) => (
            <DecimalInput
              class={inputClass}
              disabled={m.disabled}
              value={String(props.form().purchase_price)}
              onValue={(v) => setForm((f) => ({ ...f, purchase_price: parseNum(v) }))}
            />
          )}
        </ModalField>
        <ModalField settings={props.byKey} fieldKey="sales_price" fallbackLabel="Sales price">
          {(m) => (
            <DecimalInput
              class={inputClass}
              disabled={m.disabled}
              value={String(props.form().sales_price)}
              onValue={(v) => setForm((f) => ({ ...f, sales_price: parseNum(v) }))}
            />
          )}
        </ModalField>
        <ModalField settings={props.byKey} fieldKey="vip_price" fallbackLabel="VIP price">
          {(m) => (
            <DecimalInput
              class={inputClass}
              disabled={m.disabled}
              value={String(props.form().vip_price)}
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
                value={props.form().price_levels[level] ? String(props.form().price_levels[level]) : ""}
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
          Partner rates: <A href="/app/inventory/price-lists" class="text-brand-600 hover:underline">Price lists</A>
        </p>
      </Show>

      <Show when={props.itemTab === "cost"}>
        <Field label="O/E price">
          <DecimalInput
            class={inputClass}
            value={String(props.form().oe_price)}
            onValue={(v) => setForm((f) => ({ ...f, oe_price: parseNum(v) }))}
          />
        </Field>
        <p class="col-span-full text-sm font-medium text-text-primary">Standard costs</p>
        <For each={(["material", "labor", "expenses", "overhead"] as const)}>
          {(key) => (
            <Field label={key.charAt(0).toUpperCase() + key.slice(1)}>
              <DecimalInput
                class={inputClass}
                value={props.form().standard_costs[key] ? String(props.form().standard_costs[key]) : ""}
                onValue={(v) =>
                  setForm((f) => ({
                    ...f,
                    standard_costs: { ...f.standard_costs, [key]: v === "" ? 0 : parseNum(v) },
                  }))
                }
              />
            </Field>
          )}
        </For>
      </Show>

      <Show when={props.itemTab === "additional"}>
        <CustomFieldsSection entityType={INVENTORY_ENTITY.items} values={props.customValues} onChange={props.setCustom} />
      </Show>

      <Show when={props.itemTab === "management"}>
        <ModalField settings={props.byKey} fieldKey="warranty_duration_months" fallbackLabel="Warranty (months)">
          {(m) => (
            <DecimalInput
              mode="integer"
              class={inputClass}
              placeholder="No warranty"
              disabled={m.disabled}
              value={props.form().warranty_duration_months == null ? "" : String(props.form().warranty_duration_months)}
              onValue={(v) => setForm((f) => ({ ...f, warranty_duration_months: v === "" ? null : parseNum(v) }))}
            />
          )}
        </ModalField>
        <p class="col-span-full text-xs text-text-secondary">
          Serial / lot tracking lives on the <span class="font-medium text-text-primary">Qty</span> tab under Tracking.
        </p>
      </Show>
    </EntityModal>
  );
}
