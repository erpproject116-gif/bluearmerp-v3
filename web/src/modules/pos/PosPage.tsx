import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { LookupCombo, type LookupOption } from "../../shared/LookupCombo";
import { apiFetch } from "../../shared/api";
import { AuthImage } from "../../shared/AuthImage";
import { useToast } from "../../shared/toast";
import { useAuth, hasPermission } from "../../shared/auth-context";
import {
  addPosCartLine,
  checkoutPos,
  closePosSession,
  deleteHeldOrder,
  deletePosCartLine,
  fetchHeldOrders,
  fetchItemModifiers,
  fetchSessionReport,
  holdCart,
  isCashTender,
  openPosSession,
  patchPosCartLine,
  posTenderLabel,
  resumeHeldOrder,
  useInvalidatePosSession,
  usePosCatalogCategories,
  usePosCatalogItems,
  usePosCurrentSession,
  usePosSettings,
  type HeldOrder,
  type PosCartLine,
  type PosCatalogItem,
  type PosModifierGroup,
  type SessionReport,
} from "../../shared/usePos";

async function fetchLocations(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "25" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; location_name: string }[]>(`/api/v1/inventory/locations?${qs}`);
  return (res.data ?? []).map((r) => ({ id: r.id, label: r.location_name }));
}

function money(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

const ORDER_TYPE_LABELS: Record<string, string> = {
  dine_in: "Dine In",
  take_away: "Take Away",
  delivery: "Delivery",
  pickup: "Pickup",
};

export default function PosPage() {
  const auth = useAuth();
  const toast = useToast();
  const invalidate = useInvalidatePosSession();
  const session = usePosCurrentSession();
  const settings = usePosSettings();
  const categories = usePosCatalogCategories();

  const [locationId, setLocationId] = createSignal<number | null>(null);
  const [locationLabel, setLocationLabel] = createSignal("");
  const [openingCash, setOpeningCash] = createSignal("0");
  const [opening, setOpening] = createSignal(false);
  const [locationTouched, setLocationTouched] = createSignal(false);

  // Prefill the register location from POS settings so cashiers open against the
  // stock-holding location (POS sales deduct inventory from this location).
  createEffect(() => {
    if (session.data || locationTouched()) return;
    const s = settings.data;
    if (s?.default_location_id && locationId() === null) {
      setLocationId(s.default_location_id);
      setLocationLabel(s.default_location_name ?? "");
    }
  });

  const [activeCategory, setActiveCategory] = createSignal<number | null>(null);
  const [search, setSearch] = createSignal("");
  const [orderType, setOrderType] = createSignal("dine_in");
  const [adding, setAdding] = createSignal(false);
  const [checkingOut, setCheckingOut] = createSignal(false);
  const [closingCash, setClosingCash] = createSignal("");
  const [showClose, setShowClose] = createSignal(false);
  const [shiftReport, setShiftReport] = createSignal<SessionReport | null>(null);
  const [modalItem, setModalItem] = createSignal<PosCatalogItem | null>(null);
  const [discount, setDiscount] = createSignal(0);
  const [customerId, setCustomerId] = createSignal<number | null>(null);
  const [customerLabel, setCustomerLabel] = createSignal("");
  const [showPayment, setShowPayment] = createSignal(false);
  const [showBills, setShowBills] = createSignal(false);
  const [heldOrders, setHeldOrders] = createSignal<HeldOrder[]>([]);
  const [showCustomer, setShowCustomer] = createSignal(false);

  const items = usePosCatalogItems(() => ({ categoryId: activeCategory(), q: search().trim() || undefined }));

  const orderTypes = createMemo(() => settings.data?.order_types ?? ["dine_in", "take_away"]);

  const cartLines = createMemo(() => session.data?.cart_lines ?? []);
  const subtotalLines = createMemo(() => cartLines().reduce((sum, ln) => sum + ln.line_total, 0));

  const taxPreview = createMemo(() => {
    const s = settings.data;
    const rawSub = subtotalLines();
    const disc = Math.min(Math.max(discount(), 0), rawSub);
    const sub = rawSub - disc;
    const rate = s?.tax_rate_percent ?? 0;
    let mode = s?.tax_mode ?? "none";
    if (mode === "included" && s && !s.tax_inclusive) mode = "excluded";
    if (mode === "included") {
      const tax = (sub * rate) / (100 + rate);
      return { discount: disc, subtotal: sub - tax, tax, total: sub };
    }
    if (mode === "excluded") {
      const tax = (sub * rate) / 100;
      return { discount: disc, subtotal: sub, tax, total: sub + tax };
    }
    return { discount: disc, subtotal: sub, tax: 0, total: sub };
  });

  const openShift = async () => {
    if (!locationId()) {
      toast.warning("Select a location.");
      return;
    }
    setOpening(true);
    const res = await openPosSession({ location_id: locationId()!, opening_cash: Number(openingCash()) || 0 });
    setOpening(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not open session.");
      return;
    }
    invalidate();
    toast.success("POS session opened.");
  };

  const addItem = async (item: PosCatalogItem) => {
    const s = session.data;
    if (!s?.id) return;
    if (item.has_modifiers) {
      setModalItem(item);
      return;
    }
    setAdding(true);
    const res = await addPosCartLine(s.id, { item_id: item.id, qty: 1, unit_price: item.price });
    setAdding(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not add item.");
      return;
    }
    invalidate();
  };

  const addFromModal = async (payload: { qty: number; modifier_ids: number[]; notes?: string; size_label?: string }) => {
    const s = session.data;
    const item = modalItem();
    if (!s?.id || !item) return;
    setAdding(true);
    const res = await addPosCartLine(s.id, {
      item_id: item.id,
      qty: payload.qty,
      unit_price: item.price,
      modifier_ids: payload.modifier_ids,
      notes: payload.notes || null,
      size_label: payload.size_label || null,
    });
    setAdding(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not add item.");
      return;
    }
    setModalItem(null);
    invalidate();
  };

  const changeQty = async (ln: PosCartLine, delta: number) => {
    const s = session.data;
    if (!s?.id) return;
    const next = ln.qty + delta;
    if (next <= 0) {
      await removeLine(ln);
      return;
    }
    const res = await patchPosCartLine(s.id, ln.id, { qty: next });
    if (!res.success) {
      toast.warning(res.message ?? "Could not update quantity.");
      return;
    }
    invalidate();
  };

  const removeLine = async (ln: PosCartLine) => {
    const s = session.data;
    if (!s?.id) return;
    const res = await deletePosCartLine(s.id, ln.id);
    if (!res.success) {
      toast.warning(res.message ?? "Could not remove line.");
      return;
    }
    invalidate();
  };

  const clearOrder = async () => {
    const s = session.data;
    if (!s?.id) return;
    for (const ln of cartLines()) {
      await deletePosCartLine(s.id, ln.id);
    }
    invalidate();
  };

  const openPayment = () => {
    if (cartLines().length === 0) {
      toast.warning("Cart is empty.");
      return;
    }
    setShowPayment(true);
  };

  const checkout = async (tenders: { tender_type: string; amount: number }[]) => {
    const s = session.data;
    if (!s?.id) return;
    const total = Number(taxPreview().total.toFixed(2));
    if (total <= 0) {
      toast.warning("Cart is empty.");
      return;
    }
    setCheckingOut(true);
    const res = await checkoutPos(s.id, {
      tenders,
      partner_id: customerId(),
      discount_amount: taxPreview().discount,
    });
    setCheckingOut(false);
    if (!res.success) {
      toast.warning(res.message ?? "Checkout failed.");
      return;
    }
    const change = res.data?.change ?? 0;
    const label =
      tenders.length === 1
        ? posTenderLabel(tenders[0].tender_type)
        : tenders.map((t) => posTenderLabel(t.tender_type)).join(" + ");
    toast.success(
      `Sale ${res.data?.sales_no} — ${money(total)} · ${label}${change > 0 ? ` · Change ${money(change)}` : ""}`,
    );
    setShowPayment(false);
    setDiscount(0);
    setCustomerId(null);
    setCustomerLabel("");
    invalidate();
  };

  const saveBill = async () => {
    const s = session.data;
    if (!s?.id || cartLines().length === 0) {
      toast.warning("Cart is empty.");
      return;
    }
    const label = window.prompt("Label for this bill (e.g. Table 5, John):", "");
    if (label === null) return;
    const res = await holdCart(s.id, { label, order_type: orderType() });
    if (!res.success) {
      toast.warning(res.message ?? "Could not save bill.");
      return;
    }
    toast.success("Bill saved.");
    invalidate();
  };

  const openBills = async () => {
    setHeldOrders(await fetchHeldOrders());
    setShowBills(true);
  };

  const resumeBill = async (id: number) => {
    const res = await resumeHeldOrder(id);
    if (!res.success) {
      toast.warning(res.message ?? "Could not resume bill.");
      return;
    }
    setShowBills(false);
    invalidate();
  };

  const removeBill = async (id: number) => {
    await deleteHeldOrder(id);
    setHeldOrders(await fetchHeldOrders());
  };

  const applyDiscount = () => {
    const raw = window.prompt("Discount amount:", String(discount() || ""));
    if (raw === null) return;
    const val = Number(raw);
    setDiscount(Number.isFinite(val) && val > 0 ? val : 0);
  };

  const handleSearchKey = async (e: KeyboardEvent) => {
    if (e.key !== "Enter" || !settings.data?.enable_barcode) return;
    const list = items.data ?? [];
    const code = search().trim().toLowerCase();
    if (!code) return;
    const exact = list.find((i) => i.item_code.toLowerCase() === code) ?? (list.length === 1 ? list[0] : null);
    if (exact) {
      await addItem(exact);
      setSearch("");
    }
  };

  const openClose = async () => {
    const s = session.data;
    if (!s?.id) return;
    setShiftReport(null);
    setShowClose(true);
    setShiftReport(await fetchSessionReport(s.id));
  };

  const closeShift = async () => {
    const s = session.data;
    if (!s?.id) return;
    const res = await closePosSession(s.id, { closing_cash: Number(closingCash()) || 0 });
    if (!res.success) {
      toast.warning(res.message ?? "Could not close session.");
      return;
    }
    toast.success("Session closed.");
    setShowClose(false);
    setClosingCash("");
    invalidate();
  };

  return (
    <div class="flex h-screen flex-col bg-slate-100 text-slate-900">
      <header class="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
        <div class="flex items-center gap-3">
          <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-white">
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </span>
          <div>
            <h1 class="text-base font-semibold leading-tight">{auth.me?.tenant.company_name ?? "Point of Sale"}</h1>
            <Show when={session.data}>
              {(s) => <p class="text-xs text-slate-500">{s().session_no} · {s().location_name}</p>}
            </Show>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <Show when={hasPermission(auth.me, "pos.manage", "read")}>
            <A
              href="/app/pos/manage"
              class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Manage
            </A>
          </Show>
          <Show when={session.data}>
            <button
              type="button"
              class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={openClose}
            >
              Close shift
            </button>
          </Show>
          <A href="/app/dashboard" class="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800">
            Exit POS
          </A>
        </div>
      </header>

      <Show
        when={session.data}
        fallback={
          <div class="flex flex-1 items-center justify-center p-6">
            <section class="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 class="mb-1 text-lg font-semibold">Open shift</h2>
              <p class="mb-5 text-sm text-slate-500">Pick your register location and starting cash to begin selling.</p>
              <div class="space-y-4">
                <div>
                  <LookupCombo
                    label="Location"
                    value={locationLabel}
                    selectedId={locationId}
                    onInput={setLocationLabel}
                    onSelect={(o) => {
                      setLocationTouched(true);
                      setLocationId(o.id);
                      setLocationLabel(o.label);
                    }}
                    onClear={() => {
                      setLocationTouched(true);
                      setLocationId(null);
                      setLocationLabel("");
                    }}
                    fetchOptions={fetchLocations}
                    placeholder="Select location…"
                  />
                  <div class="mt-2 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    <svg class="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.29 3.86l-8.48 14.7A1 1 0 002.67 20h18.66a1 1 0 00.86-1.44l-8.48-14.7a1 1 0 00-1.72 0z" />
                    </svg>
                    <span>
                      Sales made in this shift deduct stock from this location. Choose the branch/warehouse that holds your sellable
                      inventory{settings.data?.default_location_name ? "" : " (set a default in POS → Manage → Settings)"}.
                    </span>
                  </div>
                </div>
                <div>
                  <label class="mb-1 block text-sm font-medium text-slate-600">Opening cash</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    class="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-emerald-500 focus:outline-none"
                    value={openingCash()}
                    onInput={(e) => setOpeningCash(e.currentTarget.value)}
                  />
                </div>
                <button
                  type="button"
                  class="w-full rounded-lg bg-emerald-600 py-2.5 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                  disabled={opening()}
                  onClick={openShift}
                >
                  {opening() ? "Opening…" : "Open session"}
                </button>
              </div>
            </section>
          </div>
        }
      >
        <div class="flex flex-1 overflow-hidden">
          <CategoryRail
            categories={categories.data ?? []}
            activeId={activeCategory()}
            onSelect={setActiveCategory}
          />

          <section class="flex flex-1 flex-col overflow-hidden">
            <div class="border-b border-slate-200 bg-white px-5 py-3">
              <div class="relative">
                <svg class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
                </svg>
                <input
                  type="search"
                  class="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:border-emerald-500 focus:bg-white focus:outline-none"
                  placeholder={settings.data?.enable_barcode ? "Search or scan barcode…" : "Search product…"}
                  value={search()}
                  onInput={(e) => setSearch(e.currentTarget.value)}
                  onKeyDown={handleSearchKey}
                />
              </div>
            </div>
            <div class="flex-1 overflow-auto p-5">
              <Show
                when={(items.data ?? []).length > 0}
                fallback={
                  <div class="flex h-full items-center justify-center text-sm text-slate-400">
                    {items.isLoading ? "Loading products…" : "No products found."}
                  </div>
                }
              >
                <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  <For each={items.data ?? []}>
                    {(item) => (
                      <button
                        type="button"
                        class="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm transition hover:border-emerald-400 hover:shadow-md disabled:opacity-60"
                        disabled={adding()}
                        onClick={() => addItem(item)}
                      >
                        <div class="flex aspect-square w-full items-center justify-center overflow-hidden bg-slate-100">
                          <AuthImage
                            src={item.image_url}
                            alt={item.item_name}
                            class="h-full w-full object-cover"
                            fallback={() => (
                              <span class="text-2xl font-semibold text-slate-300">{initials(item.item_name)}</span>
                            )}
                          />
                        </div>
                        <div class="flex flex-1 flex-col gap-0.5 p-3">
                          <span class="line-clamp-2 text-sm font-medium leading-snug">{item.item_name}</span>
                          <span class="mt-auto text-sm font-semibold text-emerald-600">{money(item.price)}</span>
                        </div>
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </section>

          <OrderPanel
            orderType={orderType()}
            orderTypes={orderTypes()}
            onOrderType={setOrderType}
            lines={cartLines()}
            subtotal={taxPreview().subtotal}
            tax={taxPreview().tax}
            discount={taxPreview().discount}
            total={taxPreview().total}
            customerLabel={customerLabel()}
            onCustomer={() => setShowCustomer(true)}
            onDiscount={applyDiscount}
            onSaveBill={saveBill}
            onBills={openBills}
            onQty={changeQty}
            onRemove={removeLine}
            onClear={clearOrder}
            onCheckout={openPayment}
            checkingOut={checkingOut()}
          />
        </div>
      </Show>

      <Show when={modalItem()}>
        {(item) => <ProductModal item={item()} adding={adding()} onCancel={() => setModalItem(null)} onAdd={addFromModal} />}
      </Show>

      <Show when={showPayment()}>
        <PaymentModal
          total={taxPreview().total}
          tenders={settings.data?.allowed_tenders ?? ["cash"]}
          checkingOut={checkingOut()}
          onCancel={() => setShowPayment(false)}
          onConfirm={checkout}
        />
      </Show>

      <Show when={showCustomer()}>
        <CustomerModal
          onCancel={() => setShowCustomer(false)}
          onSelect={(id, label) => {
            setCustomerId(id);
            setCustomerLabel(label);
            setShowCustomer(false);
          }}
        />
      </Show>

      <Show when={showBills()}>
        <BillsModal orders={heldOrders()} onCancel={() => setShowBills(false)} onResume={resumeBill} onDelete={removeBill} />
      </Show>

      <Show when={showClose()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setShowClose(false)}>
          <div class="max-h-[90vh] w-full max-w-sm overflow-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 class="mb-1 text-lg font-semibold">Close shift</h3>
            <p class="mb-4 text-sm text-slate-500">Shift summary (X/Z report). Count the drawer and enter the closing cash.</p>

            <div class="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <Show when={shiftReport()} fallback={<p class="text-slate-400">Loading summary…</p>}>
                {(rep) => (
                  <>
                    <div class="flex justify-between py-0.5">
                      <span class="text-slate-500">Opening cash</span>
                      <span class="tabular-nums">{money(rep().opening_cash)}</span>
                    </div>
                    <div class="flex justify-between py-0.5">
                      <span class="text-slate-500">Sales total</span>
                      <span class="tabular-nums">{money(rep().sales_total)}</span>
                    </div>

                    <div class="my-2 border-t border-slate-200" />
                    <p class="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Tenders</p>
                    <Show when={Object.keys(rep().tenders_by_type).length > 0} fallback={<p class="text-slate-400">No payments yet.</p>}>
                      <For each={Object.entries(rep().tenders_by_type)}>
                        {([type, amount]) => (
                          <div class="flex justify-between py-0.5">
                            <span class="text-slate-500">{posTenderLabel(type)}</span>
                            <span class="tabular-nums">{money(amount)}</span>
                          </div>
                        )}
                      </For>
                    </Show>

                    <Show when={rep().cash_in > 0 || rep().cash_out > 0}>
                      <div class="my-2 border-t border-slate-200" />
                      <Show when={rep().cash_in > 0}>
                        <div class="flex justify-between py-0.5">
                          <span class="text-slate-500">Cash in</span>
                          <span class="tabular-nums">{money(rep().cash_in)}</span>
                        </div>
                      </Show>
                      <Show when={rep().cash_out > 0}>
                        <div class="flex justify-between py-0.5">
                          <span class="text-slate-500">Cash out</span>
                          <span class="tabular-nums">-{money(rep().cash_out)}</span>
                        </div>
                      </Show>
                    </Show>

                    <div class="my-2 border-t border-slate-200" />
                    <div class="flex justify-between py-0.5 font-semibold">
                      <span>Expected cash in drawer</span>
                      <span class="tabular-nums">{money(rep().expected_cash)}</span>
                    </div>
                  </>
                )}
              </Show>
            </div>

            <label class="mb-1 block text-xs font-medium text-slate-500">Counted closing cash</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Closing cash count"
              class="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-lg font-semibold focus:border-emerald-500 focus:outline-none"
              value={closingCash()}
              onInput={(e) => setClosingCash(e.currentTarget.value)}
            />

            <Show when={shiftReport() && closingCash() !== ""}>
              {(() => {
                const variance = () => Number(closingCash()) - (shiftReport()?.expected_cash ?? 0);
                return (
                  <div
                    class="mb-4 flex justify-between rounded-lg px-3 py-2 text-sm font-medium"
                    classList={{
                      "bg-emerald-50 text-emerald-700": Math.abs(variance()) < 0.005,
                      "bg-amber-50 text-amber-700": Math.abs(variance()) >= 0.005,
                    }}
                  >
                    <span>{variance() < 0 ? "Short" : variance() > 0 ? "Over" : "Balanced"}</span>
                    <span class="tabular-nums">{money(Math.abs(variance()))}</span>
                  </div>
                );
              })()}
            </Show>

            <div class="flex justify-end gap-2">
              <button type="button" class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50" onClick={() => setShowClose(false)}>
                Cancel
              </button>
              <button type="button" class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700" onClick={closeShift}>
                Close session
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}

function CategoryRail(props: {
  categories: { id: number; name: string; icon?: string; color?: string }[];
  activeId: number | null;
  onSelect: (id: number | null) => void;
}) {
  const tile = (active: boolean) =>
    `flex w-full flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center text-xs font-medium transition ${
      active ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-transparent bg-white text-slate-600 hover:bg-slate-50"
    }`;
  return (
    <nav class="w-24 shrink-0 space-y-2 overflow-auto border-r border-slate-200 bg-slate-50 p-2">
      <button type="button" class={tile(props.activeId === null)} onClick={() => props.onSelect(null)}>
        <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-200 text-slate-600">
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </span>
        All Menu
      </button>
      <For each={props.categories}>
        {(c) => (
          <button type="button" class={tile(props.activeId === c.id)} onClick={() => props.onSelect(c.id)}>
            <span
              class="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-semibold text-white"
              style={{ "background-color": c.color || "#94a3b8" }}
            >
              {c.icon || initials(c.name)}
            </span>
            <span class="line-clamp-2 leading-tight">{c.name}</span>
          </button>
        )}
      </For>
    </nav>
  );
}

type PayLine = { type: string; amount: string };

function PaymentModal(props: {
  total: number;
  tenders: string[];
  checkingOut: boolean;
  onCancel: () => void;
  onConfirm: (tenders: { tender_type: string; amount: number }[]) => void;
}) {
  const first = () => props.tenders[0] ?? "cash";
  const [lines, setLines] = createSignal<PayLine[]>([{ type: first(), amount: props.total.toFixed(2) }]);

  const paid = createMemo(() =>
    lines().reduce((sum, l) => {
      const n = Number(l.amount);
      return Number.isFinite(n) && n > 0 ? sum + n : sum;
    }, 0),
  );
  const remaining = createMemo(() => Math.max(0, Number((props.total - paid()).toFixed(2))));
  const change = createMemo(() => Math.max(0, Number((paid() - props.total).toFixed(2))));
  const hasCash = createMemo(() => lines().some((l) => isCashTender(l.type)));
  // Overpayment is only valid when a cash line can dispense change.
  const canConfirm = createMemo(
    () => paid() + 0.001 >= props.total && lines().some((l) => Number(l.amount) > 0) && (change() <= 0.005 || hasCash()),
  );

  const setLine = (i: number, patch: Partial<PayLine>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const addLine = () => {
    const used = new Set(lines().map((l) => l.type));
    const next = props.tenders.find((t) => !used.has(t)) ?? first();
    const rem = remaining();
    setLines((prev) => [...prev, { type: next, amount: rem > 0 ? rem.toFixed(2) : "" }]);
  };

  const removeLine = (i: number) => setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));

  const quickAmounts = createMemo(() => {
    const t = remaining() > 0 ? remaining() : props.total;
    const set = new Set<number>([Math.ceil(t)]);
    for (const step of [50, 100, 500, 1000]) set.add(Math.ceil(t / step) * step);
    return [...set].filter((n) => n >= t).sort((a, b) => a - b).slice(0, 4);
  });

  const confirm = () => {
    const payload = lines()
      .map((l) => ({ tender_type: l.type, amount: Number(l.amount) }))
      .filter((l) => Number.isFinite(l.amount) && l.amount > 0);
    if (payload.length === 0) return;
    props.onConfirm(payload);
  };

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={props.onCancel}>
      <div class="max-h-[90vh] w-full max-w-sm overflow-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 class="mb-1 text-lg font-semibold">Payment</h3>
        <p class="mb-4 text-sm text-slate-500">Amount due <span class="font-semibold text-slate-900">{money(props.total)}</span></p>

        <div class="space-y-3">
          <For each={lines()}>
            {(line, i) => (
              <div class="rounded-xl border border-slate-200 p-3">
                <div class="flex items-center gap-2">
                  <select
                    class="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    value={line.type}
                    onChange={(e) => setLine(i(), { type: e.currentTarget.value })}
                  >
                    <For each={props.tenders}>{(t) => <option value={t}>{posTenderLabel(t)}</option>}</For>
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    class="w-28 rounded-lg border border-slate-300 px-2 py-2 text-right text-sm font-semibold focus:border-emerald-500 focus:outline-none"
                    value={line.amount}
                    onInput={(e) => setLine(i(), { amount: e.currentTarget.value })}
                  />
                  <Show when={lines().length > 1}>
                    <button
                      type="button"
                      class="shrink-0 rounded-lg border border-slate-200 px-2 py-2 text-slate-400 hover:bg-slate-50 hover:text-red-500"
                      aria-label="Remove payment"
                      onClick={() => removeLine(i())}
                    >
                      ✕
                    </button>
                  </Show>
                </div>
                <Show when={isCashTender(line.type)}>
                  <div class="mt-2 flex flex-wrap gap-2">
                    <For each={quickAmounts()}>
                      {(amt) => (
                        <button
                          type="button"
                          class="rounded-lg border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:bg-slate-50"
                          onClick={() => setLine(i(), { amount: amt.toFixed(2) })}
                        >
                          {money(amt)}
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>

        <Show when={props.tenders.length > 1}>
          <button
            type="button"
            class="mt-3 w-full rounded-lg border border-dashed border-slate-300 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50"
            onClick={addLine}
          >
            + Split payment
          </button>
        </Show>

        <div class="mt-4 space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <div class="flex justify-between">
            <span class="text-slate-500">Paid</span>
            <span class="font-semibold tabular-nums">{money(paid())}</span>
          </div>
          <Show when={remaining() > 0.005}>
            <div class="flex justify-between text-amber-600">
              <span>Remaining</span>
              <span class="font-semibold tabular-nums">{money(remaining())}</span>
            </div>
          </Show>
          <Show when={change() > 0.005}>
            <div class="flex justify-between">
              <span class="text-slate-500">Change</span>
              <span class="font-semibold tabular-nums">{money(change())}</span>
            </div>
          </Show>
        </div>

        <div class="mt-4 flex gap-2">
          <button type="button" class="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium hover:bg-slate-50" onClick={props.onCancel}>
            Cancel
          </button>
          <button
            type="button"
            class="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            disabled={props.checkingOut || !canConfirm()}
            onClick={confirm}
          >
            {props.checkingOut ? "Processing…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CustomerModal(props: { onCancel: () => void; onSelect: (id: number, label: string) => void }) {
  const [label, setLabel] = createSignal("");
  const [id, setId] = createSignal<number | null>(null);

  const fetchCustomers = async (q: string): Promise<LookupOption[]> => {
    const qs = new URLSearchParams({ page: "1", pageSize: "25" });
    if (q) qs.set("q", q);
    const res = await apiFetch<{ id: number; partner_code: string; partner_name: string }[]>(`/api/v1/inventory/partners?${qs}`);
    return (res.data ?? []).map((r) => ({ id: r.id, label: r.partner_name || r.partner_code }));
  };

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={props.onCancel}>
      <div class="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 class="mb-3 text-lg font-semibold">Select customer</h3>
        <LookupCombo
          label="Customer"
          value={label}
          selectedId={id}
          onInput={setLabel}
          onSelect={(o) => {
            setId(o.id);
            setLabel(o.label);
          }}
          onClear={() => {
            setId(null);
            setLabel("");
          }}
          fetchOptions={fetchCustomers}
          placeholder="Search customer…"
        />
        <div class="mt-4 flex justify-end gap-2">
          <button type="button" class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50" onClick={props.onCancel}>
            Cancel
          </button>
          <button
            type="button"
            class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            disabled={!id()}
            onClick={() => id() && props.onSelect(id()!, label())}
          >
            Select
          </button>
        </div>
      </div>
    </div>
  );
}

function BillsModal(props: {
  orders: HeldOrder[];
  onCancel: () => void;
  onResume: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={props.onCancel}>
      <div class="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div class="flex items-center justify-between border-b border-slate-100 p-4">
          <h3 class="text-lg font-semibold">Saved bills</h3>
          <button type="button" class="text-sm text-slate-500 hover:text-slate-800" onClick={props.onCancel}>
            Close
          </button>
        </div>
        <div class="flex-1 overflow-auto p-4">
          <Show when={props.orders.length > 0} fallback={<p class="py-8 text-center text-sm text-slate-400">No saved bills.</p>}>
            <ul class="space-y-2">
              <For each={props.orders}>
                {(o) => (
                  <li class="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5">
                    <div class="min-w-0">
                      <p class="truncate text-sm font-medium">{o.label || `Bill #${o.id}`}</p>
                      <p class="text-xs text-slate-500">{o.line_count} items · {money(o.total)}</p>
                    </div>
                    <div class="flex items-center gap-2">
                      <button type="button" class="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500" onClick={() => props.onResume(o.id)}>
                        Resume
                      </button>
                      <button type="button" class="text-xs text-red-500 hover:text-red-600" onClick={() => props.onDelete(o.id)}>
                        Delete
                      </button>
                    </div>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>
      </div>
    </div>
  );
}

function ProductModal(props: {
  item: PosCatalogItem;
  adding: boolean;
  onCancel: () => void;
  onAdd: (payload: { qty: number; modifier_ids: number[]; notes?: string; size_label?: string }) => void;
}) {
  const [groups, setGroups] = createSignal<PosModifierGroup[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [qty, setQty] = createSignal(1);
  const [notes, setNotes] = createSignal("");
  // Map of groupId -> Set of selected modifier ids.
  const [selected, setSelected] = createSignal<Record<number, number[]>>({});

  createEffect(() => {
    const id = props.item.id;
    setLoading(true);
    fetchItemModifiers(id)
      .then((g) => setGroups(g))
      .catch(() => setGroups([]))
      .finally(() => setLoading(false));
  });

  const toggle = (group: PosModifierGroup, modifierId: number) => {
    setSelected((prev) => {
      const cur = prev[group.id] ?? [];
      let next: number[];
      if (group.max_select === 1) {
        next = cur.includes(modifierId) && !group.required ? [] : [modifierId];
      } else if (cur.includes(modifierId)) {
        next = cur.filter((x) => x !== modifierId);
      } else if (group.max_select > 0 && cur.length >= group.max_select) {
        next = cur;
      } else {
        next = [...cur, modifierId];
      }
      return { ...prev, [group.id]: next };
    });
  };

  const allModifierIds = createMemo(() => Object.values(selected()).flat());

  const modifiersDelta = createMemo(() => {
    let delta = 0;
    for (const g of groups()) {
      const sel = selected()[g.id] ?? [];
      for (const m of g.modifiers) {
        if (sel.includes(m.id)) delta += m.price_delta;
      }
    }
    return delta;
  });

  const total = createMemo(() => (props.item.price + modifiersDelta()) * qty());

  const sizeLabel = createMemo(() => {
    for (const g of groups()) {
      if (g.name.trim().toLowerCase() === "size") {
        const sel = selected()[g.id] ?? [];
        const m = g.modifiers.find((x) => sel.includes(x.id));
        if (m) return m.name;
      }
    }
    return "";
  });

  const missingRequired = createMemo(() =>
    groups().some((g) => g.required && (selected()[g.id]?.length ?? 0) < Math.max(1, g.min_select)),
  );

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={props.onCancel}>
      <div class="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div class="flex items-start gap-3 border-b border-slate-100 p-4">
          <div class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
            <AuthImage
              src={props.item.image_url}
              alt={props.item.item_name}
              class="h-full w-full object-cover"
              fallback={() => <span class="text-lg font-semibold text-slate-300">{initials(props.item.item_name)}</span>}
            />
          </div>
          <div class="min-w-0 flex-1">
            <h3 class="text-base font-semibold leading-tight">{props.item.item_name}</h3>
            <p class="mt-1 text-sm font-medium text-emerald-600">{money(props.item.price)}</p>
          </div>
        </div>

        <div class="flex-1 overflow-auto p-4">
          <div class="mb-4 flex items-center justify-between">
            <span class="text-sm font-medium text-slate-700">Qty</span>
            <div class="flex items-center gap-3">
              <button type="button" class="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 text-slate-600 hover:bg-slate-50" onClick={() => setQty((q) => Math.max(1, q - 1))}>
                −
              </button>
              <span class="w-6 text-center text-sm tabular-nums">{qty()}</span>
              <button type="button" class="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 text-slate-600 hover:bg-slate-50" onClick={() => setQty((q) => q + 1)}>
                +
              </button>
            </div>
          </div>

          <Show when={!loading()} fallback={<p class="text-sm text-slate-400">Loading options…</p>}>
            <For each={groups()}>
              {(group) => (
                <div class="mb-4">
                  <div class="mb-2 flex items-center gap-2">
                    <span class="text-sm font-medium text-slate-700">{group.name}</span>
                    <Show when={group.required}>
                      <span class="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Required</span>
                    </Show>
                  </div>
                  <div class="grid grid-cols-2 gap-2">
                    <For each={group.modifiers}>
                      {(m) => {
                        const isSel = () => (selected()[group.id] ?? []).includes(m.id);
                        return (
                          <button
                            type="button"
                            class={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition ${
                              isSel() ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                            }`}
                            onClick={() => toggle(group, m.id)}
                          >
                            <span class="truncate">{m.name}</span>
                            <Show when={m.price_delta !== 0}>
                              <span class="ml-2 shrink-0 text-xs">+{money(m.price_delta)}</span>
                            </Show>
                          </button>
                        );
                      }}
                    </For>
                  </div>
                </div>
              )}
            </For>
          </Show>

          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Notes</label>
            <input
              type="text"
              class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              placeholder="Add some notes"
              value={notes()}
              onInput={(e) => setNotes(e.currentTarget.value)}
            />
          </div>
        </div>

        <div class="border-t border-slate-100 p-4">
          <div class="mb-3 flex items-center justify-between">
            <span class="text-sm text-slate-500">Total</span>
            <span class="text-lg font-semibold tabular-nums">{money(total())}</span>
          </div>
          <div class="flex gap-2">
            <button type="button" class="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium hover:bg-slate-50" onClick={props.onCancel}>
              Cancel
            </button>
            <button
              type="button"
              class="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              disabled={props.adding || missingRequired()}
              onClick={() => props.onAdd({ qty: qty(), modifier_ids: allModifierIds(), notes: notes(), size_label: sizeLabel() })}
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrderPanel(props: {
  orderType: string;
  orderTypes: string[];
  onOrderType: (t: string) => void;
  lines: PosCartLine[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  customerLabel: string;
  onCustomer: () => void;
  onDiscount: () => void;
  onSaveBill: () => void;
  onBills: () => void;
  onQty: (ln: PosCartLine, delta: number) => void;
  onRemove: (ln: PosCartLine) => void;
  onClear: () => void;
  onCheckout: () => void;
  checkingOut: boolean;
}) {
  const actionBtn = "flex flex-col items-center gap-1 rounded-lg border border-slate-200 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50";
  return (
    <aside class="flex w-80 shrink-0 flex-col border-l border-slate-200 bg-white">
      <div class="border-b border-slate-100 p-4">
        <div class="mb-3 grid grid-cols-4 gap-2">
          <button type="button" class={actionBtn} onClick={props.onCustomer}>
            <span>Customer</span>
          </button>
          <button type="button" class={actionBtn} onClick={props.onDiscount}>
            <span>Discount</span>
          </button>
          <button type="button" class={actionBtn} onClick={props.onSaveBill}>
            <span>Save Bill</span>
          </button>
          <button type="button" class={actionBtn} onClick={props.onBills}>
            <span>Bills</span>
          </button>
        </div>
        <h2 class="mb-2 text-sm font-semibold text-slate-700">Order Details</h2>
        <Show when={props.customerLabel}>
          <p class="mb-2 text-xs text-slate-500">Customer: <span class="font-medium text-slate-700">{props.customerLabel}</span></p>
        </Show>
        <div class="flex rounded-lg bg-slate-100 p-1">
          <For each={props.orderTypes}>
            {(t) => (
              <button
                type="button"
                class={`flex-1 rounded-md py-1.5 text-sm font-medium transition ${
                  props.orderType === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
                onClick={() => props.onOrderType(t)}
              >
                {ORDER_TYPE_LABELS[t] ?? t}
              </button>
            )}
          </For>
        </div>
      </div>

      <div class="flex-1 overflow-auto p-4">
        <Show
          when={props.lines.length > 0}
          fallback={
            <div class="flex h-full flex-col items-center justify-center gap-2 text-center text-slate-400">
              <span class="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
                <svg class="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </span>
              <p class="text-sm font-medium">No Order</p>
              <p class="text-xs">Tap a product to add it to the order</p>
            </div>
          }
        >
          <ul class="space-y-3">
            <For each={props.lines}>
              {(ln) => (
                <li class="flex items-start gap-2">
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-medium">{ln.item_name}</p>
                    <Show when={ln.size_label}>
                      <p class="text-xs text-slate-500">{ln.size_label}</p>
                    </Show>
                    <Show when={ln.modifiers && ln.modifiers.length > 0}>
                      <p class="truncate text-xs text-slate-400">{(ln.modifiers ?? []).map((m) => m.name).join(", ")}</p>
                    </Show>
                    <Show when={ln.notes}>
                      <p class="truncate text-xs italic text-slate-400">“{ln.notes}”</p>
                    </Show>
                    <p class="text-xs text-slate-500">{money(ln.unit_price)}</p>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <button type="button" class="flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-slate-600 hover:bg-slate-50" onClick={() => props.onQty(ln, -1)}>
                      −
                    </button>
                    <span class="w-6 text-center text-sm tabular-nums">{ln.qty}</span>
                    <button type="button" class="flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-slate-600 hover:bg-slate-50" onClick={() => props.onQty(ln, 1)}>
                      +
                    </button>
                  </div>
                  <span class="w-16 text-right text-sm font-semibold tabular-nums">{money(ln.line_total)}</span>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>

      <div class="border-t border-slate-100 p-4">
        <Show when={props.lines.length > 0}>
          <button type="button" class="mb-3 w-full rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50" onClick={props.onClear}>
            Clear All Order
          </button>
        </Show>
        <div class="space-y-1.5 rounded-xl bg-slate-50 p-3 text-sm">
          <div class="flex justify-between text-slate-500">
            <span>Subtotal</span>
            <span class="tabular-nums">{money(props.subtotal)}</span>
          </div>
          <Show when={props.discount > 0}>
            <div class="flex justify-between text-emerald-600">
              <span>Discount</span>
              <span class="tabular-nums">-{money(props.discount)}</span>
            </div>
          </Show>
          <div class="flex justify-between text-slate-500">
            <span>Tax</span>
            <span class="tabular-nums">{money(props.tax)}</span>
          </div>
          <div class="mt-1 flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
            <span>Total</span>
            <span class="tabular-nums">{money(props.total)}</span>
          </div>
        </div>
        <button
          type="button"
          class="mt-3 w-full rounded-lg bg-emerald-600 py-3 text-base font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          disabled={props.checkingOut || props.lines.length === 0}
          onClick={props.onCheckout}
        >
          {props.checkingOut ? "Processing…" : "Process Transaction"}
        </button>
      </div>
    </aside>
  );
}
