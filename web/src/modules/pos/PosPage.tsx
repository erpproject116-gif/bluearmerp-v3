import { createMemo, createSignal, For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { LookupCombo, type LookupOption } from "../../shared/LookupCombo";
import { apiFetch } from "../../shared/api";
import { useToast } from "../../shared/toast";
import { useAuth } from "../../shared/auth-context";
import {
  addPosCartLine,
  checkoutPos,
  closePosSession,
  deletePosCartLine,
  openPosSession,
  useInvalidatePosSession,
  usePosCurrentSession,
  type PosCartLine,
} from "../../shared/usePos";

async function fetchLocations(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "25" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; location_name: string }[]>(`/api/v1/inventory/locations?${qs}`);
  return (res.data ?? []).map((r) => ({ id: r.id, label: r.location_name }));
}

async function fetchItems(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "25" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; item_code: string; item_name: string; selling_price?: number }[]>(
    `/api/v1/inventory/items?${qs}`,
  );
  return (res.data ?? []).map((r) => ({
    id: r.id,
    label: `${r.item_code} — ${r.item_name}`,
    sublabel: r.selling_price != null ? String(r.selling_price) : undefined,
  }));
}

export default function PosPage() {
  const auth = useAuth();
  const toast = useToast();
  const invalidate = useInvalidatePosSession();
  const session = usePosCurrentSession();

  const [locationId, setLocationId] = createSignal<number | null>(null);
  const [locationLabel, setLocationLabel] = createSignal("");
  const [openingCash, setOpeningCash] = createSignal("0");
  const [opening, setOpening] = createSignal(false);

  const [itemId, setItemId] = createSignal<number | null>(null);
  const [itemLabel, setItemLabel] = createSignal("");
  const [unitPrice, setUnitPrice] = createSignal("");
  const [qty, setQty] = createSignal("1");
  const [adding, setAdding] = createSignal(false);

  const [closingCash, setClosingCash] = createSignal("");
  const [checkingOut, setCheckingOut] = createSignal(false);

  const cartTotal = createMemo(() =>
    (session.data?.cart_lines ?? []).reduce((sum, ln) => sum + ln.line_total, 0),
  );

  const openShift = async () => {
    if (!locationId()) {
      toast.warning("Select a location.");
      return;
    }
    setOpening(true);
    const res = await openPosSession({
      location_id: locationId()!,
      opening_cash: Number(openingCash()) || 0,
    });
    setOpening(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not open session.");
      return;
    }
    invalidate();
    toast.success("POS session opened.");
  };

  const addLine = async () => {
    const s = session.data;
    if (!s?.id || !itemId()) {
      toast.warning("Select an item.");
      return;
    }
    const q = Number(qty());
    const price = Number(unitPrice());
    if (q <= 0 || price < 0) {
      toast.warning("Enter valid quantity and price.");
      return;
    }
    setAdding(true);
    const res = await addPosCartLine(s.id, { item_id: itemId()!, qty: q, unit_price: price });
    setAdding(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not add item.");
      return;
    }
    setItemId(null);
    setItemLabel("");
    setUnitPrice("");
    setQty("1");
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

  const checkout = async () => {
    const s = session.data;
    if (!s?.id) return;
    const total = cartTotal();
    if (total <= 0) {
      toast.warning("Cart is empty.");
      return;
    }
    setCheckingOut(true);
    const res = await checkoutPos(s.id, { tenders: [{ tender_type: "cash", amount: total }] });
    setCheckingOut(false);
    if (!res.success) {
      toast.warning(res.message ?? "Checkout failed.");
      return;
    }
    toast.success(`Sale ${res.data?.sales_no} — ${total.toFixed(2)}`);
    invalidate();
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
    invalidate();
  };

  return (
    <div class="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <header class="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <div>
          <h1 class="text-xl font-semibold tracking-tight">Point of Sale</h1>
          <p class="text-sm text-slate-400">{auth.me?.tenant.company_name}</p>
        </div>
        <div class="flex items-center gap-3">
          <Show when={session.data}>
            {(s) => (
              <span class="rounded-full bg-emerald-900/50 px-3 py-1 text-sm text-emerald-300">
                {s().session_no} · {s().location_name}
              </span>
            )}
          </Show>
          <A href="/app/dashboard" class="text-sm text-slate-400 hover:text-white">
            Exit POS
          </A>
        </div>
      </header>

      <main class="flex flex-1 flex-col gap-4 p-6 lg:flex-row">
        <Show
          when={session.data}
          fallback={
            <section class="mx-auto w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6">
              <h2 class="mb-4 text-lg font-medium">Open shift</h2>
              <div class="space-y-4">
                <LookupCombo
                  label="Location"
                  value={locationLabel}
                  selectedId={locationId}
                  onInput={setLocationLabel}
                  onSelect={(o) => {
                    setLocationId(o.id);
                    setLocationLabel(o.label);
                  }}
                  onClear={() => {
                    setLocationId(null);
                    setLocationLabel("");
                  }}
                  fetchOptions={fetchLocations}
                  placeholder="Select location…"
                />
                <div>
                  <label class="mb-1 block text-sm text-slate-400">Opening cash</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    class="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2"
                    value={openingCash()}
                    onInput={(e) => setOpeningCash(e.currentTarget.value)}
                  />
                </div>
                <button
                  type="button"
                  class="w-full rounded-lg bg-emerald-600 py-2.5 font-medium hover:bg-emerald-500 disabled:opacity-50"
                  disabled={opening()}
                  onClick={openShift}
                >
                  {opening() ? "Opening…" : "Open session"}
                </button>
              </div>
            </section>
          }
        >
          {(s) => (
            <>
              <section class="flex flex-1 flex-col rounded-xl border border-slate-800 bg-slate-900 p-4">
                <h2 class="mb-3 text-sm font-medium uppercase tracking-wide text-slate-500">Add item</h2>
                <div class="mb-4 grid gap-3 sm:grid-cols-4">
                  <div class="sm:col-span-2">
                    <LookupCombo
                      label="Item"
                      value={itemLabel}
                      selectedId={itemId}
                      onInput={setItemLabel}
                      onSelect={(o) => {
                        setItemId(o.id);
                        setItemLabel(o.label);
                        if (o.sublabel) setUnitPrice(o.sublabel);
                      }}
                      onClear={() => {
                        setItemId(null);
                        setItemLabel("");
                      }}
                      fetchOptions={fetchItems}
                      placeholder="Search item…"
                    />
                  </div>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="Qty"
                    class="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2"
                    value={qty()}
                    onInput={(e) => setQty(e.currentTarget.value)}
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Price"
                    class="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2"
                    value={unitPrice()}
                    onInput={(e) => setUnitPrice(e.currentTarget.value)}
                  />
                </div>
                <button
                  type="button"
                  class="mb-6 w-full rounded-lg bg-blue-600 py-2 font-medium hover:bg-blue-500 disabled:opacity-50 sm:w-auto sm:px-8"
                  disabled={adding()}
                  onClick={addLine}
                >
                  Add to cart
                </button>

                <div class="flex-1 overflow-auto">
                  <table class="w-full text-left text-sm">
                    <thead class="border-b border-slate-800 text-slate-500">
                      <tr>
                        <th class="py-2">Item</th>
                        <th class="py-2 text-right">Qty</th>
                        <th class="py-2 text-right">Price</th>
                        <th class="py-2 text-right">Total</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      <For each={s().cart_lines ?? []}>
                        {(ln) => (
                          <tr class="border-b border-slate-800/60">
                            <td class="py-2">
                              <div class="font-medium">{ln.item_name}</div>
                              <div class="text-xs text-slate-500">{ln.item_code}</div>
                            </td>
                            <td class="py-2 text-right">{ln.qty}</td>
                            <td class="py-2 text-right">{ln.unit_price.toFixed(2)}</td>
                            <td class="py-2 text-right font-medium">{ln.line_total.toFixed(2)}</td>
                            <td class="py-2 text-right">
                              <button type="button" class="text-red-400 hover:text-red-300" onClick={() => removeLine(ln)}>
                                Remove
                              </button>
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </section>

              <aside class="w-full shrink-0 space-y-4 lg:w-80">
                <div class="rounded-xl border border-slate-800 bg-slate-900 p-4">
                  <div class="mb-1 text-sm text-slate-500">Cart total</div>
                  <div class="text-3xl font-bold tabular-nums">{cartTotal().toFixed(2)}</div>
                  <button
                    type="button"
                    class="mt-4 w-full rounded-lg bg-emerald-600 py-3 text-lg font-semibold hover:bg-emerald-500 disabled:opacity-50"
                    disabled={checkingOut() || cartTotal() <= 0}
                    onClick={checkout}
                  >
                    {checkingOut() ? "Processing…" : "Cash checkout"}
                  </button>
                </div>
                <div class="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
                  <div>Opening: {s().opening_cash.toFixed(2)}</div>
                  <div>Sales: {s().sales_total.toFixed(2)}</div>
                </div>
                <div class="rounded-xl border border-slate-800 bg-slate-900 p-4">
                  <h3 class="mb-2 text-sm font-medium text-slate-400">Close shift</h3>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Closing cash count"
                    class="mb-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2"
                    value={closingCash()}
                    onInput={(e) => setClosingCash(e.currentTarget.value)}
                  />
                  <button
                    type="button"
                    class="w-full rounded-lg border border-slate-600 py-2 hover:bg-slate-800"
                    onClick={closeShift}
                  >
                    Close session
                  </button>
                </div>
              </aside>
            </>
          )}
        </Show>
      </main>
    </div>
  );
}
