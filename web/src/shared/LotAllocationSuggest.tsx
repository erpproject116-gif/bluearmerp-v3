import { createEffect, createSignal, For, Show } from "solid-js";
import { apiFetch } from "./api";

type LotSuggestion = {
  lot_batch_id: number;
  lot_no?: string;
  qty: number;
  expiry_date?: string | null;
};

export function LotAllocationSuggest(props: {
  itemId: number;
  locationId?: number | null;
  qty: number;
  lotAllocationMethod?: string;
  onPick?: (lotBatchId: number, lotNo: string) => void;
}) {
  const [method, setMethod] = createSignal("manual");
  const [suggestions, setSuggestions] = createSignal<LotSuggestion[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");

  const isAuto = () => (props.lotAllocationMethod ?? "manual").toLowerCase() !== "manual";

  createEffect(() => {
    if (!isAuto()) {
      setSuggestions([]);
      return;
    }
    const loc = props.locationId;
    const qty = props.qty;
    if (!loc || qty <= 0) {
      setSuggestions([]);
      return;
    }

    void (async () => {
      setLoading(true);
      setError("");
      const qs = new URLSearchParams({
        item_id: String(props.itemId),
        location_id: String(loc),
        qty: String(qty),
      });
      const res = await apiFetch<{ method: string; suggestions: LotSuggestion[] }>(
        `/api/v1/inventory/lot-batches/suggest?${qs}`,
        undefined,
        { silent: true },
      );
      setLoading(false);
      if (!res.success || !res.data) {
        setError(res.message ?? "Could not load lot suggestions.");
        setSuggestions([]);
        return;
      }
      setMethod(res.data.method ?? "fefo");
      setSuggestions(res.data.suggestions ?? []);
    })();
  });

  return (
    <Show when={isAuto()}>
      <div class="mt-1 rounded border border-sky-100 bg-sky-50/80 px-2 py-1 text-[10px] leading-snug text-sky-950">
        <Show when={loading()}>
          <span>Loading {method().toUpperCase()} suggestions…</span>
        </Show>
        <Show when={!loading() && error()}>
          <span class="text-amber-800">{error()}</span>
        </Show>
        <Show when={!loading() && !error() && suggestions().length > 0}>
          <span class="font-medium uppercase tracking-wide">{method()} pick: </span>
          <For each={suggestions()}>
            {(s) => (
              <button
                type="button"
                class="mr-1 text-brand-700 underline hover:no-underline"
                onClick={() => props.onPick?.(s.lot_batch_id, s.lot_no ?? "")}
              >
                {s.lot_no ?? `#${s.lot_batch_id}`} ({s.qty}
                {s.expiry_date ? ` · exp ${s.expiry_date.slice(0, 10)}` : ""})
              </button>
            )}
          </For>
        </Show>
        <Show when={!loading() && !error() && suggestions().length === 0}>
          <span>No {method().toUpperCase()} lot available — pick manually or check stock/location.</span>
        </Show>
      </div>
    </Show>
  );
}

async function fetchItemLotAllocation(itemId: number): Promise<string> {
  const res = await apiFetch<{ lot_allocation_method?: string }>(`/api/v1/inventory/items/${itemId}`, undefined, {
    silent: true,
  });
  return res.data?.lot_allocation_method ?? "manual";
}

export { fetchItemLotAllocation };
