import { createResource, createSignal, For, Show } from "solid-js";
import { A, useSearchParams } from "@solidjs/router";
import { apiFetch, apiAbsoluteUrl, getAccessToken } from "../../shared/api";
import { AuthImage } from "../../shared/AuthImage";
import { LookupCombo, type LookupOption } from "../../shared/LookupCombo";
import { useToast } from "../../shared/toast";
import { useAuth, hasPermission } from "../../shared/auth-context";
import { sanitizeIntegerInput, bindDecimalInput, formatMoney } from "../../shared/money";
import { usePosSettings, savePosSettings, fetchPosLogs, posTenderLabel, POS_TENDER_TYPES, type PosSettings, type PosModifierGroup } from "../../shared/usePos";
import { uiLabel } from "../../shared/branding/uiLabel";
import {
  POS_LABEL_FIELDS,
  POS_THEME_DEFAULTS,
  POS_UI_LABEL_DEFAULTS,
  resolvePosTheme,
} from "./posBranding";

type ItemRow = {
  id: number;
  item_code: string;
  item_name: string;
  purchase_price: number;
  sales_price: number;
  vip_price: number;
  warranty_duration_months?: number | null;
  reorder_level?: number | null;
  track_serial: boolean;
  track_lot: boolean;
  track_inventory_qty: boolean;
  status: string;
  item_category_id?: number | null;
};

type CategoryRow = {
  id: number;
  code: string;
  name: string;
  active: boolean;
  icon?: string;
  color?: string;
  sort_order: number;
};

type TaxType = { id: number; name: string; tax_mode: string; rate_percent: number };
type LocationRow = { id: number; location_name: string };
type FinAccount = { id: number; account_code: string; account_name: string; account_type: string };

const TAB_LABELS: { id: string; label: string }[] = [
  { id: "products", label: "Products" },
  { id: "categories", label: "Categories" },
  { id: "modifiers", label: "Modifiers" },
  { id: "settings", label: "Settings" },
  { id: "logs", label: "Logs" },
];

const ALL_ORDER_TYPES = ["dine_in", "take_away", "delivery", "pickup"];
const ORDER_TYPE_LABELS: Record<string, string> = {
  dine_in: "Dine In",
  take_away: "Take Away",
  delivery: "Delivery",
  pickup: "Pickup",
};
const ALL_TENDERS = [...POS_TENDER_TYPES];

async function uploadImage(itemId: number, file: File): Promise<boolean> {
  const token = await getAccessToken();
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(apiAbsoluteUrl(`/api/v1/inventory/items/${itemId}/image`), {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  return res.ok;
}

export default function PosSettingsPage() {
  const auth = useAuth();
  const [searchParams, setSearchParams] = useSearchParams<{ tab?: string }>();
  const tab = () => searchParams.tab ?? "products";
  const canManage = () => hasPermission(auth.me, "pos.manage", "read");

  return (
    <Show
      when={canManage()}
      fallback={
        <div class="mx-auto max-w-6xl p-6">
          <div class="rounded-lg border border-stroke bg-slate-50 p-6 text-center">
            <h1 class="text-lg font-semibold text-text-primary">POS management</h1>
            <p class="mt-2 text-sm text-text-secondary">
              You don't have permission to manage POS. Ask an administrator to grant the
              <span class="font-medium"> POS Management</span> permission.
            </p>
          </div>
        </div>
      }
    >
    <div class="mx-auto max-w-6xl p-6">
      <h1 class="text-xl font-semibold text-text-primary">POS management</h1>
      <p class="mt-1 text-sm text-text-secondary">
        Manage products, categories, register behavior, terminology, and branding for this store. Cashiers sell from{" "}
        <A href="/app/pos" class="font-medium text-brand-600 hover:underline">
          POS Terminal
        </A>
        ; this page is for administrators.
      </p>

      <div class="mt-5 flex gap-1 border-b border-stroke">
        <For each={TAB_LABELS}>
          {(t) => (
            <button
              type="button"
              class={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
                tab() === t.id
                  ? "border-brand-500 text-brand-700"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
              onClick={() => setSearchParams({ tab: t.id })}
            >
              {t.label}
            </button>
          )}
        </For>
      </div>

      <div class="mt-6">
        <Show when={tab() === "products"}>
          <ProductsTab />
        </Show>
        <Show when={tab() === "categories"}>
          <CategoriesTab />
        </Show>
        <Show when={tab() === "modifiers"}>
          <ModifiersTab />
        </Show>
        <Show when={tab() === "settings"}>
          <SettingsTab />
        </Show>
        <Show when={tab() === "logs"}>
          <LogsTab />
        </Show>
      </div>
    </div>
    </Show>
  );
}

function ProductsTab() {
  const toast = useToast();
  const [q, setQ] = createSignal("");
  const [categories] = createResource(async () => {
    const res = await apiFetch<CategoryRow[]>("/api/v1/inventory/item-categories?active=false");
    return res.data ?? [];
  });
  const [items, { refetch }] = createResource(
    () => q(),
    async (query) => {
      const qs = new URLSearchParams({ page: "1", pageSize: "100", sort: "item_name", order: "asc" });
      if (query) qs.set("q", query);
      const res = await apiFetch<ItemRow[]>(`/api/v1/inventory/items?${qs}`);
      return res.data ?? [];
    },
  );

  const saveItem = async (row: ItemRow, patch: Partial<ItemRow>) => {
    const merged = { ...row, ...patch };
    const res = await apiFetch(`/api/v1/inventory/items/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        item_name: merged.item_name,
        purchase_price: merged.purchase_price,
        sales_price: merged.sales_price,
        vip_price: merged.vip_price,
        warranty_duration_months: merged.warranty_duration_months,
        reorder_level: merged.reorder_level,
        track_serial: merged.track_serial,
        track_lot: merged.track_lot,
        track_inventory_qty: merged.track_inventory_qty,
        status: merged.status,
        item_category_id: merged.item_category_id,
      }),
    });
    if (!res.success) {
      toast.warning(res.message ?? "Could not save product.");
      return;
    }
    refetch();
  };

  const onPickImage = async (row: ItemRow, e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const ok = await uploadImage(row.id, file);
    if (!ok) {
      toast.warning("Image upload failed.");
      return;
    }
    toast.success("Image updated.");
    refetch();
  };

  return (
    <div>
      <div class="mb-4 max-w-sm">
        <input
          type="search"
          class="w-full rounded-lg border border-stroke px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          placeholder="Search products…"
          value={q()}
          onInput={(e) => setQ(e.currentTarget.value)}
        />
      </div>
      <div class="overflow-hidden rounded-xl border border-stroke bg-white">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-stroke bg-slate-50 text-text-secondary">
            <tr>
              <th class="px-4 py-2.5">Image</th>
              <th class="px-4 py-2.5">Product</th>
              <th class="px-4 py-2.5">Category</th>
              <th class="px-4 py-2.5 text-right">Price</th>
              <th class="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            <For each={items() ?? []}>
              {(row) => <ProductRow row={row} categories={categories() ?? []} onSave={saveItem} onPickImage={onPickImage} />}
            </For>
          </tbody>
        </table>
        <Show when={(items() ?? []).length === 0}>
          <p class="px-4 py-6 text-center text-sm text-text-secondary">
            {items.loading  ? uiLabel("common.loading") : "No products found."}
          </p>
        </Show>
      </div>
    </div>
  );
}

function ProductRow(props: {
  row: ItemRow;
  categories: CategoryRow[];
  onSave: (row: ItemRow, patch: Partial<ItemRow>) => void;
  onPickImage: (row: ItemRow, e: Event) => void;
}) {
  const [price, setPrice] = createSignal(String(props.row.sales_price));
  const [categoryId, setCategoryId] = createSignal<number | null>(props.row.item_category_id ?? null);
  let fileInput: HTMLInputElement | undefined;

  const dirty = () =>
    Number(price()) !== props.row.sales_price || (categoryId() ?? null) !== (props.row.item_category_id ?? null);

  return (
    <tr class="border-b border-stroke/60 last:border-0">
      <td class="px-4 py-2">
        <div class="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-xs font-semibold text-slate-400">
          <AuthImage
            src={`/api/v1/inventory/items/${props.row.id}/image`}
            alt={props.row.item_name}
            class="h-full w-full object-cover"
            fallback={() => <span>IMG</span>}
          />
        </div>
      </td>
      <td class="px-4 py-2">
        <div class="font-medium text-text-primary">{props.row.item_name}</div>
        <div class="text-xs text-text-secondary">{props.row.item_code}</div>
      </td>
      <td class="px-4 py-2">
        <select
          class="rounded-lg border border-stroke px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
          value={categoryId() ?? ""}
          onChange={(e) => setCategoryId(e.currentTarget.value ? Number(e.currentTarget.value) : null)}
        >
          <option value="">— None —</option>
          <For each={props.categories}>{(c) => <option value={c.id}>{c.name}</option>}</For>
        </select>
      </td>
      <td class="px-4 py-2 text-right">
        <input
          type="text"
          inputmode="decimal"
          autocomplete="off"
          class="w-24 rounded-lg border border-stroke px-2 py-1.5 text-right text-sm focus:border-brand-500 focus:outline-none"
          value={price()}
          onInput={(e) => bindDecimalInput(e.currentTarget, setPrice)}
        />
      </td>
      <td class="px-4 py-2">
        <div class="flex items-center justify-end gap-2">
          <input ref={fileInput} type="file" accept="image/*" class="hidden" onChange={(e) => props.onPickImage(props.row, e)} />
          <button type="button" class="rounded-lg border border-stroke px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-slate-50" onClick={() => fileInput?.click()}>
            Image
          </button>
          <button
            type="button"
            class="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-40"
            disabled={!dirty()}
            onClick={() => props.onSave(props.row, { sales_price: Number(price()), item_category_id: categoryId() })}
          >
            Save
          </button>
        </div>
      </td>
    </tr>
  );
}

function CategoriesTab() {
  const toast = useToast();
  const [rows, { refetch }] = createResource(async () => {
    const res = await apiFetch<CategoryRow[]>("/api/v1/inventory/item-categories?active=false");
    return res.data ?? [];
  });

  const [code, setCode] = createSignal("");
  const [name, setName] = createSignal("");
  const [icon, setIcon] = createSignal("");
  const [color, setColor] = createSignal("#10b981");

  const addCategory = async () => {
    if (!code().trim() || !name().trim()) {
      toast.warning("Code and name are required.");
      return;
    }
    const res = await apiFetch("/api/v1/inventory/item-categories", {
      method: "POST",
      body: JSON.stringify({ code: code().trim(), name: name().trim(), icon: icon().trim(), color: color(), active: true }),
    });
    if (!res.success) {
      toast.warning(res.message ?? "Could not save category.");
      return;
    }
    setCode("");
    setName("");
    setIcon("");
    refetch();
  };

  const saveRow = async (row: CategoryRow, patch: Partial<CategoryRow>) => {
    const merged = { ...row, ...patch };
    const res = await apiFetch(`/api/v1/inventory/item-categories/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: merged.name,
        active: merged.active,
        icon: merged.icon,
        color: merged.color,
        sort_order: merged.sort_order,
      }),
    });
    if (!res.success) {
      toast.warning(res.message ?? "Could not save category.");
      return;
    }
    refetch();
  };

  return (
    <div class="grid gap-6 lg:grid-cols-3">
      <div class="lg:col-span-2">
        <div class="overflow-hidden rounded-xl border border-stroke bg-white">
          <table class="w-full text-left text-sm">
            <thead class="border-b border-stroke bg-slate-50 text-text-secondary">
              <tr>
                <th class="px-4 py-2.5">Icon</th>
                <th class="px-4 py-2.5">Name</th>
                <th class="px-4 py-2.5">Order</th>
                <th class="px-4 py-2.5">Active</th>
                <th class="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              <For each={rows() ?? []}>{(row) => <CategoryRowEdit row={row} onSave={saveRow} />}</For>
            </tbody>
          </table>
          <Show when={(rows() ?? []).length === 0}>
            <p class="px-4 py-6 text-center text-sm text-text-secondary">{rows.loading  ? uiLabel("common.loading") : "No categories yet."}</p>
          </Show>
        </div>
      </div>

      <div class="rounded-xl border border-stroke bg-white p-4">
        <h3 class="mb-3 text-sm font-semibold text-text-primary">Add category</h3>
        <div class="space-y-3">
          <div>
            <label class="mb-1 block text-xs font-medium text-text-secondary">Code</label>
            <input class="w-full rounded-lg border border-stroke px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" value={code()} onInput={(e) => setCode(e.currentTarget.value)} placeholder="e.g. drinks" />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-text-secondary">Name</label>
            <input class="w-full rounded-lg border border-stroke px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" value={name()} onInput={(e) => setName(e.currentTarget.value)} placeholder="e.g. Drinks" />
          </div>
          <div class="flex gap-3">
            <div class="flex-1">
              <label class="mb-1 block text-xs font-medium text-text-secondary">Icon (emoji/text)</label>
              <input class="w-full rounded-lg border border-stroke px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" value={icon()} onInput={(e) => setIcon(e.currentTarget.value)} placeholder="🥤" maxLength={4} />
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-text-secondary">Color</label>
              <input type="color" class="h-[38px] w-14 rounded-lg border border-stroke" value={color()} onInput={(e) => setColor(e.currentTarget.value)} />
            </div>
          </div>
          <button type="button" class="w-full rounded-lg bg-brand-600 py-2 text-sm font-medium text-white hover:bg-brand-500" onClick={addCategory}>
            Add category
          </button>
        </div>
      </div>
    </div>
  );
}

function CategoryRowEdit(props: { row: CategoryRow; onSave: (row: CategoryRow, patch: Partial<CategoryRow>) => void }) {
  const [name, setName] = createSignal(props.row.name);
  const [sortOrder, setSortOrder] = createSignal(String(props.row.sort_order));
  const [icon, setIcon] = createSignal(props.row.icon ?? "");
  const [color, setColor] = createSignal(props.row.color || "#94a3b8");

  const dirty = () =>
    name() !== props.row.name ||
    Number(sortOrder()) !== props.row.sort_order ||
    icon() !== (props.row.icon ?? "") ||
    color() !== (props.row.color || "#94a3b8");

  return (
    <tr class="border-b border-stroke/60 last:border-0">
      <td class="px-4 py-2">
        <div class="flex items-center gap-2">
          <span class="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-semibold text-white" style={{ "background-color": color() }}>
            {icon() || props.row.name[0]?.toUpperCase()}
          </span>
          <input class="w-16 rounded-lg border border-stroke px-2 py-1 text-sm" value={icon()} onInput={(e) => setIcon(e.currentTarget.value)} maxLength={4} placeholder="icon" />
          <input type="color" class="h-8 w-9 rounded border border-stroke" value={color()} onInput={(e) => setColor(e.currentTarget.value)} />
        </div>
      </td>
      <td class="px-4 py-2">
        <input class="w-full rounded-lg border border-stroke px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
      </td>
      <td class="px-4 py-2">
        <input
          type="text"
          inputmode="numeric"
          autocomplete="off"
          class="w-16 rounded-lg border border-stroke px-2 py-1.5 text-sm"
          value={sortOrder()}
          onInput={(e) => setSortOrder(sanitizeIntegerInput(e.currentTarget.value))}
        />
      </td>
      <td class="px-4 py-2">
        <input type="checkbox" checked={props.row.active} onChange={(e) => props.onSave(props.row, { active: e.currentTarget.checked })} />
      </td>
      <td class="px-4 py-2 text-right">
        <button
          type="button"
          class="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-40"
          disabled={!dirty()}
          onClick={() => props.onSave(props.row, { name: name(), sort_order: Number(sortOrder()), icon: icon(), color: color() })}
        >
          Save
        </button>
      </td>
    </tr>
  );
}

function LogsTab() {
  const [logs] = createResource(fetchPosLogs);
  return (
    <div class="overflow-hidden rounded-xl border border-stroke bg-white">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-stroke bg-slate-50 text-text-secondary">
          <tr>
            <th class="px-4 py-2.5">When</th>
            <th class="px-4 py-2.5">Action</th>
            <th class="px-4 py-2.5">Target</th>
            <th class="px-4 py-2.5">By</th>
          </tr>
        </thead>
        <tbody>
          <For each={logs() ?? []}>
            {(l) => (
              <tr class="border-b border-stroke/60 last:border-0">
                <td class="px-4 py-2 text-text-secondary">{new Date(l.created_at).toLocaleString()}</td>
                <td class="px-4 py-2 font-medium text-text-primary">{l.action_code.replace(/^pos\./, "")}</td>
                <td class="px-4 py-2 text-text-secondary">{l.target_type}{l.target_id ? ` #${l.target_id}` : ""}</td>
                <td class="px-4 py-2 text-text-secondary">{l.actor_name || "—"}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <Show when={(logs() ?? []).length === 0}>
        <p class="px-4 py-6 text-center text-sm text-text-secondary">{logs.loading  ? uiLabel("common.loading") : "No POS activity yet."}</p>
      </Show>
    </div>
  );
}

function ModifiersTab() {
  const toast = useToast();
  const [groups, { refetch }] = createResource(async () => {
    const res = await apiFetch<PosModifierGroup[]>("/api/v1/pos/modifier-groups");
    return res.data ?? [];
  });
  const [categories] = createResource(async () => {
    const res = await apiFetch<CategoryRow[]>("/api/v1/inventory/item-categories?active=false");
    return res.data ?? [];
  });

  const [name, setName] = createSignal("");
  const [scope, setScope] = createSignal("item");
  const [categoryId, setCategoryId] = createSignal<number | null>(null);
  const [itemId, setItemId] = createSignal<number | null>(null);
  const [itemLabel, setItemLabel] = createSignal("");
  const [maxSelect, setMaxSelect] = createSignal("1");
  const [required, setRequired] = createSignal(false);

  const fetchItems = async (q: string): Promise<LookupOption[]> => {
    const qs = new URLSearchParams({ page: "1", pageSize: "25", sort: "item_name", order: "asc" });
    if (q) qs.set("q", q);
    const res = await apiFetch<{ id: number; item_code: string; item_name: string }[]>(`/api/v1/inventory/items?${qs}`);
    return (res.data ?? []).map((r) => ({ id: r.id, label: `${r.item_code} — ${r.item_name}` }));
  };

  const createGroup = async () => {
    if (!name().trim()) {
      toast.warning("Group name is required.");
      return;
    }
    if (scope() === "item" && !itemId()) {
      toast.warning("Select an item for this group.");
      return;
    }
    if (scope() === "category" && !categoryId()) {
      toast.warning("Select a category for this group.");
      return;
    }
    const res = await apiFetch("/api/v1/pos/modifier-groups", {
      method: "POST",
      body: JSON.stringify({
        name: name().trim(),
        scope: scope(),
        item_id: scope() === "item" ? itemId() : null,
        category_id: scope() === "category" ? categoryId() : null,
        max_select: Number(maxSelect()) || 1,
        min_select: required() ? 1 : 0,
        required: required(),
      }),
    });
    if (!res.success) {
      toast.warning(res.message ?? "Could not create group.");
      return;
    }
    setName("");
    setItemId(null);
    setItemLabel("");
    setCategoryId(null);
    refetch();
  };

  const deleteGroup = async (id: number) => {
    const res = await apiFetch(`/api/v1/pos/modifier-groups/${id}`, { method: "DELETE" });
    if (!res.success) {
      toast.warning(res.message ?? "Could not delete group.");
      return;
    }
    refetch();
  };

  const addOption = async (groupId: number, optName: string, price: string) => {
    if (!optName.trim()) {
      toast.warning("Option name is required.");
      return;
    }
    const res = await apiFetch(`/api/v1/pos/modifier-groups/${groupId}/modifiers`, {
      method: "POST",
      body: JSON.stringify({ name: optName.trim(), price_delta: Number(price) || 0 }),
    });
    if (!res.success) {
      toast.warning(res.message ?? "Could not add option.");
      return;
    }
    refetch();
  };

  const deleteOption = async (id: number) => {
    const res = await apiFetch(`/api/v1/pos/modifiers/${id}`, { method: "DELETE" });
    if (!res.success) {
      toast.warning(res.message ?? "Could not delete option.");
      return;
    }
    refetch();
  };

  return (
    <div class="grid gap-6 lg:grid-cols-3">
      <div class="space-y-4 lg:col-span-2">
        <For each={groups() ?? []}>
          {(group) => <ModifierGroupCard group={group} onAddOption={addOption} onDeleteOption={deleteOption} onDeleteGroup={deleteGroup} />}
        </For>
        <Show when={(groups() ?? []).length === 0}>
          <p class="rounded-xl border border-stroke bg-white px-4 py-6 text-center text-sm text-text-secondary">
            {groups.loading  ? uiLabel("common.loading") : "No modifier groups yet. Create one to offer sizes and add-ons."}
          </p>
        </Show>
      </div>

      <div class="rounded-xl border border-stroke bg-white p-4">
        <h3 class="mb-3 text-sm font-semibold text-text-primary">Add group</h3>
        <div class="space-y-3">
          <div>
            <label class="mb-1 block text-xs font-medium text-text-secondary">Group name</label>
            <input class="w-full rounded-lg border border-stroke px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" value={name()} onInput={(e) => setName(e.currentTarget.value)} placeholder="e.g. Size, Add-ons" />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-text-secondary">Applies to</label>
            <select class="w-full rounded-lg border border-stroke px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" value={scope()} onChange={(e) => setScope(e.currentTarget.value)}>
              <option value="item">Specific item</option>
              <option value="category">Category</option>
            </select>
          </div>
          <Show when={scope() === "item"}>
            <LookupCombo
              label="Item"
              value={itemLabel}
              selectedId={itemId}
              onInput={setItemLabel}
              onSelect={(o) => {
                setItemId(o.id);
                setItemLabel(o.label);
              }}
              onClear={() => {
                setItemId(null);
                setItemLabel("");
              }}
              fetchOptions={fetchItems}
              placeholder="Search item…"
            />
          </Show>
          <Show when={scope() === "category"}>
            <div>
              <label class="mb-1 block text-xs font-medium text-text-secondary">Category</label>
              <select class="w-full rounded-lg border border-stroke px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" value={categoryId() ?? ""} onChange={(e) => setCategoryId(e.currentTarget.value ? Number(e.currentTarget.value) : null)}>
                <option value="">— Select —</option>
                <For each={categories() ?? []}>{(c) => <option value={c.id}>{c.name}</option>}</For>
              </select>
            </div>
          </Show>
          <div>
            <label class="mb-1 block text-xs font-medium text-text-secondary">Max selectable</label>
            <input
              type="text"
              inputmode="numeric"
              autocomplete="off"
              class="w-full rounded-lg border border-stroke px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              value={maxSelect()}
              onInput={(e) => setMaxSelect(sanitizeIntegerInput(e.currentTarget.value))}
            />
          </div>
          <label class="flex items-center gap-2 text-sm text-text-primary">
            <input type="checkbox" checked={required()} onChange={(e) => setRequired(e.currentTarget.checked)} />
            Required (customer must choose)
          </label>
          <button type="button" class="w-full rounded-lg bg-brand-600 py-2 text-sm font-medium text-white hover:bg-brand-500" onClick={createGroup}>
            Add group
          </button>
        </div>
      </div>
    </div>
  );
}

function ModifierGroupCard(props: {
  group: PosModifierGroup;
  onAddOption: (groupId: number, name: string, price: string) => void;
  onDeleteOption: (id: number) => void;
  onDeleteGroup: (id: number) => void;
}) {
  const [optName, setOptName] = createSignal("");
  const [optPrice, setOptPrice] = createSignal("0");

  return (
    <div class="rounded-xl border border-stroke bg-white p-4">
      <div class="mb-3 flex items-start justify-between">
        <div>
          <h4 class="text-sm font-semibold text-text-primary">{props.group.name}</h4>
          <p class="text-xs text-text-secondary">
            {props.group.scope === "item" ? "Item-specific" : "Category"} · max {props.group.max_select}
            {props.group.required ? " · required" : ""}
          </p>
        </div>
        <button type="button" class="text-xs font-medium text-red-500 hover:text-red-600" onClick={() => props.onDeleteGroup(props.group.id)}>
          Delete
        </button>
      </div>
      <ul class="mb-3 space-y-1.5">
        <For each={props.group.modifiers}>
          {(m) => (
            <li class="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-sm">
              <span>{m.name}</span>
              <div class="flex items-center gap-3">
                <span class="text-xs text-text-secondary">+{formatMoney(m.price_delta)}</span>
                <button type="button" class="text-xs text-red-500 hover:text-red-600" onClick={() => props.onDeleteOption(m.id)}>
                  Remove
                </button>
              </div>
            </li>
          )}
        </For>
        <Show when={props.group.modifiers.length === 0}>
          <li class="px-1 text-xs text-text-secondary">No options yet.</li>
        </Show>
      </ul>
      <div class="flex gap-2">
        <input class="flex-1 rounded-lg border border-stroke px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none" placeholder="Option name" value={optName()} onInput={(e) => setOptName(e.currentTarget.value)} />
        <input
          type="text"
          inputmode="decimal"
          autocomplete="off"
          class="w-24 rounded-lg border border-stroke px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
          placeholder="+ price"
          value={optPrice()}
          onInput={(e) => bindDecimalInput(e.currentTarget, setOptPrice)}
        />
        <button
          type="button"
          class="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
          onClick={() => {
            props.onAddOption(props.group.id, optName(), optPrice());
            setOptName("");
            setOptPrice("0");
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

function SettingsTab() {
  const toast = useToast();
  const settings = usePosSettings();
  const [taxTypes] = createResource(async () => {
    const res = await apiFetch<TaxType[]>("/api/v1/quotation/tax-types?page=1&pageSize=100&status=active&sort=sort_order&order=asc");
    return res.data ?? [];
  });
  const [locations] = createResource(async () => {
    const res = await apiFetch<LocationRow[]>("/api/v1/inventory/locations?page=1&pageSize=100");
    return res.data ?? [];
  });
  const [accounts] = createResource(async () => {
    const res = await apiFetch<FinAccount[]>("/api/v1/finance/accounts?page=1&pageSize=500&is_active=true");
    return res.data ?? [];
  });

  const [draft, setDraft] = createSignal<PosSettings | null>(null);
  const current = (): PosSettings =>
    draft() ??
    settings.data ?? {
      tax_inclusive: true,
      order_types: ["dine_in", "take_away"],
      allowed_tenders: ["cash", "gcash", "maya", "qrph", "card", "bank_transfer"],
      require_customer: false,
      enable_barcode: false,
      auto_post_accounting: true,
      auto_create_receipt: true,
      ui_labels: {},
      theme: {},
    };

  const update = (patch: Partial<PosSettings>) => setDraft({ ...current(), ...patch });

  const toggleIn = (list: string[], value: string): string[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const save = async () => {
    const body: PosSettings = {
      ...current(),
      ui_labels: current().ui_labels ?? {},
      theme: current().theme ?? {},
    };
    const res = await savePosSettings(body);
    if (!res.success) {
      toast.warning(res.message ?? "Could not save settings.");
      return;
    }
    toast.success("Settings saved.");
    setDraft(null);
    settings.refetch();
  };

  return (
    <Show when={!settings.isLoading} fallback={<p class="text-sm text-text-secondary">Loading settings…</p>}>
      <div class="max-w-4xl space-y-6">
        <div class="rounded-xl border border-stroke bg-white p-5">
          <h3 class="mb-4 text-sm font-semibold text-text-primary">Tax &amp; pricing</h3>
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="mb-1 block text-xs font-medium text-text-secondary">Default tax type</label>
              <select
                class="w-full rounded-lg border border-stroke px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                value={current().default_tax_type_id ?? ""}
                onChange={(e) => update({ default_tax_type_id: e.currentTarget.value ? Number(e.currentTarget.value) : null })}
              >
                <option value="">— None —</option>
                <For each={taxTypes() ?? []}>
                  {(t) => <option value={t.id}>{t.name} ({t.rate_percent}%)</option>}
                </For>
              </select>
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-text-secondary">Default location</label>
              <select
                class="w-full rounded-lg border border-stroke px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                value={current().default_location_id ?? ""}
                onChange={(e) => update({ default_location_id: e.currentTarget.value ? Number(e.currentTarget.value) : null })}
              >
                <option value="">— None —</option>
                <For each={locations() ?? []}>{(l) => <option value={l.id}>{l.location_name}</option>}</For>
              </select>
            </div>
          </div>
          <label class="mt-4 flex items-center gap-2 text-sm text-text-primary">
            <input type="checkbox" checked={current().tax_inclusive} onChange={(e) => update({ tax_inclusive: e.currentTarget.checked })} />
            Prices are tax-inclusive
          </label>
        </div>

        <div class="rounded-xl border border-stroke bg-white p-5">
          <h3 class="mb-4 text-sm font-semibold text-text-primary">Order types</h3>
          <div class="flex flex-wrap gap-2">
            <For each={ALL_ORDER_TYPES}>
              {(t) => (
                <label class={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${current().order_types.includes(t) ? "border-brand-500 bg-brand-50 text-brand-700" : "border-stroke text-text-secondary"}`}>
                  <input type="checkbox" class="hidden" checked={current().order_types.includes(t)} onChange={() => update({ order_types: toggleIn(current().order_types, t) })} />
                  {ORDER_TYPE_LABELS[t]}
                </label>
              )}
            </For>
          </div>
        </div>

        <div class="rounded-xl border border-stroke bg-white p-5">
          <h3 class="mb-4 text-sm font-semibold text-text-primary">Payment &amp; behavior</h3>
          <div class="mb-4">
            <p class="mb-2 text-xs font-medium text-text-secondary">Allowed tenders</p>
            <div class="flex flex-wrap gap-2">
              <For each={ALL_TENDERS}>
                {(t) => (
                  <label class={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${current().allowed_tenders.includes(t) ? "border-brand-500 bg-brand-50 text-brand-700" : "border-stroke text-text-secondary"}`}>
                    <input type="checkbox" class="hidden" checked={current().allowed_tenders.includes(t)} onChange={() => update({ allowed_tenders: toggleIn(current().allowed_tenders, t) })} />
                    {posTenderLabel(t)}
                  </label>
                )}
              </For>
            </div>
          </div>
          <label class="flex items-center gap-2 text-sm text-text-primary">
            <input type="checkbox" checked={current().require_customer} onChange={(e) => update({ require_customer: e.currentTarget.checked })} />
            Require customer selection
          </label>
          <label class="mt-2 flex items-center gap-2 text-sm text-text-primary">
            <input type="checkbox" checked={current().enable_barcode} onChange={(e) => update({ enable_barcode: e.currentTarget.checked })} />
            Enable barcode scanning
          </label>
          <div class="mt-4">
            <label class="mb-1 block text-xs font-medium text-text-secondary">Receipt footer</label>
            <textarea
              rows={2}
              class="w-full rounded-lg border border-stroke px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              value={current().receipt_footer ?? ""}
              onInput={(e) => update({ receipt_footer: e.currentTarget.value })}
              placeholder="Thank you for your purchase!"
            />
          </div>
        </div>

        <div class="rounded-xl border border-stroke bg-white p-5">
          <h3 class="mb-2 text-sm font-semibold text-text-primary">Accounting (auto on checkout)</h3>
          <p class="mb-4 text-xs text-text-secondary">
            Each POS checkout creates a sales invoice and can post GL plus an official receipt. Defaults use chart
            accounts 1089 (A/R), 210 (sales), 1020 (cash), 1023 (card/bank).
          </p>
          <label class="flex items-center gap-2 text-sm text-text-primary">
            <input type="checkbox" checked={current().auto_post_accounting !== false} onChange={(e) => update({ auto_post_accounting: e.currentTarget.checked })} />
            Auto-post sales invoice journal (DR A/R, CR sales, CR VAT)
          </label>
          <label class="mt-2 flex items-center gap-2 text-sm text-text-primary">
            <input type="checkbox" checked={current().auto_create_receipt !== false} onChange={(e) => update({ auto_create_receipt: e.currentTarget.checked })} />
            Auto-create official receipt (DR cash/card, CR A/R)
          </label>
          <div class="mt-4 grid gap-4 sm:grid-cols-2">
            <AccountSelect label="Sales revenue account" accounts={accounts() ?? []} value={current().sales_account_id} onChange={(id) => update({ sales_account_id: id })} />
            <AccountSelect label="Receivable account (A/R)" accounts={accounts() ?? []} value={current().receivable_account_id} onChange={(id) => update({ receivable_account_id: id })} />
            <AccountSelect label="Cash tender account" accounts={accounts() ?? []} value={current().cash_account_id} onChange={(id) => update({ cash_account_id: id })} />
            <AccountSelect label="Card / e-wallet account" accounts={accounts() ?? []} value={current().card_account_id} onChange={(id) => update({ card_account_id: id })} />
          </div>
          <p class="mt-3 text-xs text-text-secondary">
            Journal auto-post follows Process Policies → accounts_auto_post_sales / accounts_auto_post_or.
          </p>
        </div>

        <div class="rounded-xl border border-stroke bg-white p-5">
          <h3 class="mb-1 text-sm font-semibold text-text-primary">Hospitality profile</h3>
          <p class="mb-3 text-xs text-text-secondary">
            Restaurant mode emphasizes table / covers language on the register. Rooms and stays stay in Booking — not POS.
          </p>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded-lg border border-stroke px-3 py-1.5 text-sm"
              classList={{ "border-brand-500 bg-brand-50": (current().hospitality_profile ?? "retail") === "retail" }}
              onClick={() =>
                update({
                  hospitality_profile: "retail",
                  ui_labels: { ...(current().ui_labels ?? {}), table: "Table / seat", guests: "Guests" },
                  order_types: current().order_types?.length ? current().order_types : ["dine_in", "take_away", "delivery", "pickup"],
                })
              }
            >
              Retail
            </button>
            <button
              type="button"
              class="rounded-lg border border-stroke px-3 py-1.5 text-sm"
              classList={{ "border-brand-500 bg-brand-50": current().hospitality_profile === "restaurant" }}
              onClick={() =>
                update({
                  hospitality_profile: "restaurant",
                  ui_labels: {
                    ...(current().ui_labels ?? {}),
                    table: "Table number",
                    guests: "Covers",
                    save_bill: "Hold table",
                    bills: "Open tables",
                    open_shift_hint: "Open the shift, then take table orders and tenders.",
                  },
                  order_types: ["dine_in", "take_away", "delivery", "pickup"],
                })
              }
            >
              Restaurant
            </button>
          </div>
        </div>

        <div class="rounded-xl border border-stroke bg-white p-5">
          <h3 class="mb-1 text-sm font-semibold text-text-primary">Terminology &amp; button text</h3>
          <p class="mb-4 text-xs text-text-secondary">
            Customize labels shown on the POS register (header buttons, order panel, forms). Leave blank to use the default.
          </p>
          <div class="grid gap-3 sm:grid-cols-2">
            <For each={POS_LABEL_FIELDS}>
              {(f) => (
                <div>
                  <label class="mb-1 block text-xs font-medium text-text-secondary">{f.label}</label>
                  <input
                    type="text"
                    class="w-full rounded-lg border border-stroke px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                    placeholder={POS_UI_LABEL_DEFAULTS[f.key] ?? ""}
                    value={current().ui_labels?.[f.key] ?? ""}
                    onInput={(e) => {
                      const next = { ...(current().ui_labels ?? {}) };
                      const v = e.currentTarget.value;
                      if (v.trim()) next[f.key] = v;
                      else delete next[f.key];
                      update({ ui_labels: next });
                    }}
                  />
                </div>
              )}
            </For>
          </div>
        </div>

        <div class="rounded-xl border border-stroke bg-white p-5">
          <h3 class="mb-1 text-sm font-semibold text-text-primary">Branding &amp; colors</h3>
          <p class="mb-4 text-xs text-text-secondary">
            Color palette for the POS shell (header, primary actions, background). Company name still comes from tenant branding.
          </p>
          <PosThemeEditor
            theme={current().theme ?? {}}
            payLabel={current().ui_labels?.pay?.trim() || POS_UI_LABEL_DEFAULTS.pay}
            onChange={(theme) => update({ theme })}
          />
          <button
            type="button"
            class="mt-3 text-xs font-medium text-brand-700 hover:underline"
            onClick={() => update({ theme: {} })}
          >
            Reset colors to defaults
          </button>
        </div>

        <div class="flex justify-end">
          <button type="button" class="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-40" disabled={!draft()} onClick={save}>
            Save settings
          </button>
        </div>
      </div>
    </Show>
  );
}

function PosThemeEditor(props: {
  theme: Record<string, string>;
  payLabel: string;
  onChange: (theme: Record<string, string>) => void;
}) {
  const resolved = () => resolvePosTheme(props.theme);
  const fields: { key: keyof typeof POS_THEME_DEFAULTS; label: string }[] = [
    { key: "primary", label: "Primary (buttons)" },
    { key: "accent", label: "Accent" },
    { key: "header_bg", label: "Header background" },
    { key: "header_text", label: "Header text" },
    { key: "surface", label: "Page background" },
    { key: "button_text", label: "Primary button text" },
  ];
  const setThemeKey = (key: string, value: string) => {
    const next = { ...props.theme };
    if (value.trim()) next[key] = value.trim();
    else delete next[key];
    props.onChange(next);
  };
  return (
    <>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <For each={fields}>
          {(f) => (
            <div>
              <label class="mb-1 block text-xs font-medium text-text-secondary">{f.label}</label>
              <div class="flex items-center gap-2">
                <input
                  type="color"
                  class="h-9 w-12 cursor-pointer rounded border border-stroke bg-white p-0.5"
                  value={resolved()[f.key]}
                  onInput={(e) => setThemeKey(f.key, e.currentTarget.value)}
                />
                <input
                  type="text"
                  class="min-w-0 flex-1 rounded-lg border border-stroke px-3 py-2 font-mono text-sm focus:border-brand-500 focus:outline-none"
                  value={props.theme[f.key] ?? resolved()[f.key]}
                  onInput={(e) => setThemeKey(f.key, e.currentTarget.value)}
                  placeholder={POS_THEME_DEFAULTS[f.key]}
                />
              </div>
            </div>
          )}
        </For>
      </div>
      <div
        class="mt-4 flex items-center justify-between rounded-lg border border-stroke px-4 py-3"
        style={{
          "background-color": resolved().header_bg,
          color: resolved().header_text,
        }}
      >
        <span class="text-sm font-semibold">POS header preview</span>
        <span
          class="rounded-md px-3 py-1.5 text-xs font-medium"
          style={{
            "background-color": resolved().primary,
            color: resolved().button_text,
          }}
        >
          {props.payLabel}
        </span>
      </div>
    </>
  );
}

function AccountSelect(props: {
  label: string;
  accounts: FinAccount[];
  value?: number | null;
  onChange: (id: number | null) => void;
}) {
  return (
    <div>
      <label class="mb-1 block text-xs font-medium text-text-secondary">{props.label}</label>
      <select
        class="w-full rounded-lg border border-stroke px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        value={props.value ?? ""}
        onChange={(e) => props.onChange(e.currentTarget.value ? Number(e.currentTarget.value) : null)}
      >
        <option value="">— Chart default —</option>
        <For each={props.accounts}>
          {(a) => (
            <option value={a.id}>
              {a.account_code} — {a.account_name}
            </option>
          )}
        </For>
      </select>
    </div>
  );
}
