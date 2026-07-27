import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, onMount, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { apiFetch } from "../../../shared/api";
import { LineUnitSelect } from "../../../shared/LineUnitSelect";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";
import { modalDismissClass } from "../../../shared/Modal";
import { useToast } from "../../../shared/toast";
import { uiLabel } from "../../../shared/branding/uiLabel";
import { takeDocSeed } from "../../../shared/docSeed";

type RfqRow = {
  id: number;
  rfq_no: string;
  rfq_date: string;
  status: string;
  line_count: number;
};

type RfqLineDraft = {
  item_id: number | null;
  item_code: string;
  item_name: string;
  qty: string;
  unit_id: number | null;
  unit_code: string;
};

const emptyRfqLine = (): RfqLineDraft => ({
  item_id: null,
  item_code: "",
  item_name: "",
  qty: "1",
  unit_id: null,
  unit_code: "",
});

async function fetchItems(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; item_code: string; item_name: string }[]>(
    `/api/v1/inventory/items?${qs}`,
  );
  return (res.data ?? []).map((i) => ({ id: i.id, label: `${i.item_code} — ${i.item_name}` }));
}

export default function RfqListPage() {
  const toast = useToast();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = createSignal(false);
  const [lines, setLines] = createSignal<RfqLineDraft[]>([emptyRfqLine()]);
  const [creating, setCreating] = createSignal(false);

  // Copilot approve-to-seed handoff: staged RFQ lines open the create panel prefilled.
  onMount(() => {
    const seed = takeDocSeed("rfq");
    if (!seed?.lines?.length) return;
    const seeded = seed.lines.slice(0, 200).map((line) => ({
      item_id: line.item_id ?? null,
      item_code: line.item_code?.trim() ?? "",
      item_name: line.item_name?.trim() ?? "",
      qty: line.qty == null ? "1" : String(line.qty),
      unit_id: line.unit_id ?? null,
      unit_code: (line.unit_code ?? line.unit ?? "").trim(),
    }));
    if (!seeded.length) return;
    setLines(seeded);
    setCreateOpen(true);
    if (seed.needs_qty_review) {
      toast.warning("Copilot prefilled RFQ lines with qty 1 — review quantities before creating.");
    }
  });

  const list = createQuery(() => ({
    queryKey: ["rfq-list"],
    queryFn: async () => {
      const res = await apiFetch<RfqRow[]>("/api/v1/purchase-order/rfq");
      if (!res.success) throw new Error(res.message ?? "Failed to load");
      return res.data ?? [];
    },
  }));

  const invalidate = () => void client.invalidateQueries({ queryKey: ["rfq-list"] });

  const addLine = () => setLines((prev) => [...prev, emptyRfqLine()]);

  const createRfq = async () => {
    const payload = lines()
      .map((ln) => ({
        item_id: ln.item_id ?? undefined,
        item_code: ln.item_code,
        item_name: ln.item_name,
        qty: Number(ln.qty),
        unit_id: ln.unit_id ?? undefined,
        unit_code: ln.unit_code || undefined,
      }))
      .filter((ln) => ln.qty > 0 && (ln.item_id || ln.item_name));
    if (!payload.length) {
      toast.warning("Add at least one line with item and quantity.");
      return;
    }
    setCreating(true);
    const res = await apiFetch<{ rfq_no: string }>("/api/v1/purchase-order/rfq", {
      method: "POST",
      body: JSON.stringify({ lines: payload }),
    });
    setCreating(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to create RFQ.");
      return;
    }
    toast.success(`RFQ ${res.data?.rfq_no ?? "created"}.`);
    setLines([emptyRfqLine()]);
    setCreateOpen(false);
    invalidate();
  };

  return (
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-semibold text-slate-900">Request for Quotation</h1>
        <button
          type="button"
          class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          onClick={() => setCreateOpen(true)}
        >
          New RFQ
        </button>
      </div>

      <Show when={!list.isLoading} fallback={<p class="text-sm text-slate-500">{uiLabel("common.loading")}</p>}>
        <table class="min-w-full overflow-hidden rounded-lg border border-slate-200 text-sm">
          <thead class="bg-slate-50">
            <tr>
              <th class="px-3 py-2 text-left">RFQ No</th>
              <th class="px-3 py-2 text-left">Date</th>
              <th class="px-3 py-2 text-left">Status</th>
              <th class="px-3 py-2 text-right">Lines</th>
            </tr>
          </thead>
          <tbody>
            <For each={list.data ?? []}>
              {(row) => (
                <tr
                  class="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                  onClick={() => navigate(`/app/purchase-order/rfq/${row.id}`)}
                >
                  <td class="px-3 py-2">{row.rfq_no}</td>
                  <td class="px-3 py-2">{row.rfq_date}</td>
                  <td class="px-3 py-2 capitalize">{row.status}</td>
                  <td class="px-3 py-2 text-right">{row.line_count}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Show>

      <Show when={createOpen()}>
        <div class="fixed inset-0 z-[55] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
          <div class="w-full max-w-2xl rounded-2xl border border-stroke bg-white p-6 shadow-xl">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="text-lg font-semibold">New RFQ</h2>
              <button type="button" class={modalDismissClass} onClick={() => setCreateOpen(false)}>
                Close
              </button>
            </div>
            <For each={lines()}>
              {(ln, idx) => (
                <div class="mb-3 space-y-2 rounded-lg border border-stroke p-3">
                  <LookupCombo
                    label={`Item ${idx() + 1} (search inventory or type a free-text name)`}
                    value={() => {
                      const l = lines()[idx()];
                      if (l.item_id && l.item_code) return `${l.item_code} — ${l.item_name}`;
                      return l.item_name || l.item_code || "";
                    }}
                    selectedId={() => ln.item_id}
                    onInput={(text) => {
                      setLines((prev) => {
                        const next = [...prev];
                        next[idx()] = {
                          ...next[idx()],
                          item_id: null,
                          item_code: "",
                          item_name: text,
                        };
                        return next;
                      });
                    }}
                    onSelect={(o) => {
                      const parts = o.label.split(" — ");
                      setLines((prev) => {
                        const next = [...prev];
                        next[idx()] = {
                          ...next[idx()],
                          item_id: o.id,
                          item_code: parts[0] ?? "",
                          item_name: parts.slice(1).join(" — ") || o.label,
                        };
                        return next;
                      });
                    }}
                    onClear={() => {
                      setLines((prev) => {
                        const next = [...prev];
                        next[idx()] = { ...emptyRfqLine(), qty: next[idx()].qty };
                        return next;
                      });
                    }}
                    fetchOptions={fetchItems}
                    placeholder="Type product name or search inventory…"
                  />
                  <div class="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_100px_110px]">
                    <label class="block text-sm">
                      <span class="text-text-secondary">Item code (optional)</span>
                      <input
                        class="mt-1 w-full rounded border border-stroke px-2 py-1"
                        value={ln.item_code}
                        placeholder="Free-text code"
                        onInput={(e) => {
                          const v = e.currentTarget.value;
                          setLines((prev) => {
                            const next = [...prev];
                            next[idx()] = { ...next[idx()], item_code: v, item_id: null };
                            return next;
                          });
                        }}
                      />
                    </label>
                    <label class="block text-sm">
                      <span class="text-text-secondary">Qty</span>
                      <input
                        type="number"
                        class="mt-1 w-full rounded border border-stroke px-2 py-1"
                        min="0"
                        value={ln.qty}
                        onInput={(e) => {
                          const v = e.currentTarget.value;
                          setLines((prev) => {
                            const next = [...prev];
                            next[idx()] = { ...next[idx()], qty: v };
                            return next;
                          });
                        }}
                      />
                    </label>
                    <label class="block text-sm">
                      <span class="text-text-secondary">UoM</span>
                      <div class="mt-1">
                        <LineUnitSelect
                          unitId={ln.unit_id}
                          unitCode={ln.unit_code}
                          onChange={(u) =>
                            setLines((prev) => {
                              const next = [...prev];
                              next[idx()] = { ...next[idx()], unit_id: u.unit_id, unit_code: u.unit_code };
                              return next;
                            })
                          }
                        />
                      </div>
                    </label>
                  </div>
                </div>
              )}
            </For>
            <button type="button" class="text-sm text-brand-600 hover:underline" onClick={addLine}>
              + Add line
            </button>
            <div class="mt-6 flex justify-end gap-2">
              <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={() => setCreateOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={creating()}
                onClick={() => void createRfq()}
              >
                {creating() ? "Creating…" : "Create RFQ"}
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
