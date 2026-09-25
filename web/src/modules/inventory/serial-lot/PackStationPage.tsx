import { createEffect, createSignal, For, onMount, Show } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { apiFetch } from "../../../shared/api";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { useToast } from "../../../shared/toast";
import { SerialLotLayout } from "./SerialLotLayout";

type PackSession = {
  id: number;
  pack_no: string;
  status: string;
  location_id?: number;
  location_name?: string;
  sales_order_no?: string;
  created_at?: string;
  lines?: { id: number; line_no: number; item_code?: string; qty: number; container_no?: string }[];
};

const primaryBtn =
  "rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50";
const secondaryBtn =
  "rounded-lg border border-stroke px-4 py-2 text-sm font-medium text-text-secondary hover:bg-slate-50 disabled:opacity-50";

async function fetchLocations(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; location_name: string }[]>(`/api/v1/inventory/locations?${qs}`, {}, { silent: true });
  return (res.data ?? []).map((l) => ({ id: l.id, label: l.location_name }));
}

function paramText(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value ?? "").trim();
}

export default function PackStationPage() {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [session, setSession] = createSignal<PackSession | null>(null);
  const [sessions, setSessions] = createSignal<PackSession[]>([]);
  const [listLoading, setListLoading] = createSignal(true);
  const [scanInput, setScanInput] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [locationId, setLocationId] = createSignal<number | null>(null);
  const [locationLabel, setLocationLabel] = createSignal("");

  const loadSessions = async () => {
    setListLoading(true);
    const res = await apiFetch<PackSession[]>(
      "/api/v1/inventory/pack-sessions?status=open&page=1&pageSize=50&sort=created_at&order=desc",
      {},
      { silent: true },
    );
    setListLoading(false);
    if (res.success) setSessions(res.data ?? []);
  };

  onMount(() => {
    void loadSessions();
  });

  createEffect(() => {
    const raw = Number(paramText(searchParams.location_id));
    if (!Number.isFinite(raw) || raw <= 0) return;
    setLocationId(raw);
    const name = paramText(searchParams.location_name);
    if (name) setLocationLabel(name);
  });

  const openExisting = async (id: number) => {
    setBusy(true);
    const res = await apiFetch<PackSession>(`/api/v1/inventory/pack-sessions/${id}`, {}, { silent: true });
    setBusy(false);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? "Could not open that pack session.");
      return;
    }
    setSession(res.data);
  };

  const openSession = async () => {
    const loc = locationId();
    if (!loc) {
      toast.warning("Choose a location first.");
      return;
    }
    setBusy(true);
    const res = await apiFetch<PackSession>(
      "/api/v1/inventory/pack-sessions",
      {
        method: "POST",
        body: JSON.stringify({ location_id: loc, notes: "Pack station session" }),
      },
      { silent: true },
    );
    setBusy(false);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? "Failed to open pack session.");
      return;
    }
    setSession(res.data);
    toast.success(`Pack session ${res.data.pack_no} opened.`);
    void loadSessions();
  };

  const scanContainer = async () => {
    const s = session();
    const code = scanInput().trim();
    if (!s || !code) return;
    setBusy(true);
    const res = await apiFetch<{ results: { status: string; message?: string }[] }>(
      `/api/v1/inventory/pack-sessions/${s.id}/scans/batch`,
      {
        method: "POST",
        body: JSON.stringify({
          scans: [{ client_pack_id: crypto.randomUUID(), container_no: code, qty: 1 }],
        }),
      },
      { silent: true },
    );
    setBusy(false);
    setScanInput("");
    if (!res.success) {
      toast.warning(res.message ?? "Scan failed.");
      return;
    }
    const row = res.data?.results?.[0];
    if (row?.status !== "accepted" && row?.status !== "idempotent_replay") {
      toast.warning(row?.message ?? "Container rejected.");
      return;
    }
    toast.success("Container packed.");
    const refresh = await apiFetch<PackSession>(`/api/v1/inventory/pack-sessions/${s.id}`, {}, { silent: true });
    if (refresh.success && refresh.data) setSession(refresh.data);
  };

  const complete = async () => {
    const s = session();
    if (!s) return;
    setBusy(true);
    const res = await apiFetch<PackSession>(`/api/v1/inventory/pack-sessions/${s.id}/complete`, { method: "POST" }, { silent: true });
    setBusy(false);
    if (!res.success) {
      toast.warning(res.message ?? "Complete failed.");
      return;
    }
    setSession(null);
    toast.success("Pack session completed.");
    void loadSessions();
  };

  return (
    <SerialLotLayout>
      <div class="space-y-4">
        <div>
          <h1 class="text-lg font-semibold text-text-primary">Pack station</h1>
          <p class="mt-1 text-sm text-text-secondary">Open a session for a location, then scan containers into it.</p>
        </div>
        <Show
          when={session()}
          fallback={
            <div class="space-y-4">
              <div class="flex flex-wrap items-end gap-3">
                <div class="min-w-[16rem] flex-1">
                  <LookupCombo
                    label="Location"
                    required
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
                  />
                </div>
                <button type="button" class={primaryBtn} disabled={busy()} onClick={() => void openSession()}>
                  Open pack session
                </button>
              </div>
              <Show
                when={!listLoading() && sessions().length === 0}
                fallback={
                  <div class="overflow-x-auto rounded-xl border border-stroke">
                    <table class="w-full text-sm">
                      <thead class="bg-slate-50 text-left text-xs uppercase text-text-secondary">
                        <tr>
                          <th class="px-3 py-2">Pack no.</th>
                          <th class="px-3 py-2">Location</th>
                          <th class="px-3 py-2">Status</th>
                          <th class="px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        <For each={sessions()}>
                          {(row) => (
                            <tr class="border-t border-stroke">
                              <td class="px-3 py-2 font-medium">{row.pack_no}</td>
                              <td class="px-3 py-2">{row.location_name || "—"}</td>
                              <td class="px-3 py-2 capitalize">{row.status}</td>
                              <td class="px-3 py-2 text-right">
                                <button
                                  type="button"
                                  class="text-sm font-medium text-brand-600 hover:underline disabled:opacity-50"
                                  disabled={busy()}
                                  onClick={() => void openExisting(row.id)}
                                >
                                  Open
                                </button>
                              </td>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                  </div>
                }
              >
                <p class="text-sm text-text-secondary">No open pack sessions. Choose a location and open one.</p>
              </Show>
            </div>
          }
        >
          {(s) => (
            <div class="space-y-4">
              <p class="text-sm text-text-secondary">
                Session <strong class="text-text-primary">{s().pack_no}</strong> · {s().status}
                <Show when={s().location_name}> · {s().location_name}</Show>
              </p>
              <div class="flex flex-wrap items-end gap-2">
                <Field label="Scan container">
                  <input
                    class={inputClass}
                    value={scanInput()}
                    onInput={(e) => setScanInput(e.currentTarget.value)}
                    onKeyDown={(e) => e.key === "Enter" && void scanContainer()}
                    placeholder="Container barcode…"
                  />
                </Field>
                <button type="button" class={secondaryBtn} disabled={busy()} onClick={() => void scanContainer()}>
                  Add
                </button>
              </div>
              <table class="w-full text-sm">
                <thead>
                  <tr class="text-left text-xs uppercase text-text-secondary">
                    <th class="py-1">#</th>
                    <th class="py-1">Item</th>
                    <th class="py-1 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={s().lines ?? []}>
                    {(ln) => (
                      <tr class="border-t border-stroke">
                        <td class="py-1.5">{ln.line_no}</td>
                        <td class="py-1.5">{ln.item_code ?? ln.id}</td>
                        <td class="py-1.5 text-right">{ln.qty}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
              <div class="flex gap-2">
                <button type="button" class={primaryBtn} disabled={busy()} onClick={() => void complete()}>
                  Complete pack
                </button>
                <button type="button" class={secondaryBtn} disabled={busy()} onClick={() => setSession(null)}>
                  Back to sessions
                </button>
              </div>
            </div>
          )}
        </Show>
      </div>
    </SerialLotLayout>
  );
}
