import { createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { useToast } from "../../../shared/toast";
import { SerialLotLayout } from "./SerialLotLayout";

type PackSession = {
  id: number;
  pack_no: string;
  status: string;
  location_name?: string;
  lines?: { id: number; line_no: number; item_code?: string; qty: number; container_no?: string }[];
};

export default function PackStationPage() {
  const toast = useToast();
  const [session, setSession] = createSignal<PackSession | null>(null);
  const [scanInput, setScanInput] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  const openSession = async () => {
    setBusy(true);
    const res = await apiFetch<PackSession>("/api/v1/inventory/pack-sessions", {
      method: "POST",
      body: JSON.stringify({ notes: "Pack station session" }),
    });
    setBusy(false);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? "Failed to open pack session.");
      return;
    }
    setSession(res.data);
    toast.success(`Pack session ${res.data.pack_no} opened.`);
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
    const refresh = await apiFetch<PackSession>(`/api/v1/inventory/pack-sessions/${s.id}`);
    if (refresh.success && refresh.data) setSession(refresh.data);
  };

  const complete = async () => {
    const s = session();
    if (!s) return;
    setBusy(true);
    const res = await apiFetch<PackSession>(`/api/v1/inventory/pack-sessions/${s.id}/complete`, { method: "POST" });
    setBusy(false);
    if (!res.success) {
      toast.warning(res.message ?? "Complete failed.");
      return;
    }
    setSession(null);
    toast.success("Pack session completed.");
  };

  return (
    <SerialLotLayout title="Pack station">
      <Show
        when={session()}
        fallback={
          <button type="button" class="btn btn-primary" disabled={busy()} onClick={() => void openSession()}>
            Open pack session
          </button>
        }
      >
        {(s) => (
          <div class="space-y-4">
            <p class="text-sm text-slate-600">
              Session <strong>{s().pack_no}</strong> · {s().status} · {s().location_name}
            </p>
            <div class="flex gap-2">
              <Field label="Scan container">
                <input
                  class={inputClass}
                  value={scanInput()}
                  onInput={(e) => setScanInput(e.currentTarget.value)}
                  onKeyDown={(e) => e.key === "Enter" && void scanContainer()}
                  placeholder="Container barcode…"
                />
              </Field>
              <button type="button" class="btn btn-secondary self-end" disabled={busy()} onClick={() => void scanContainer()}>
                Add
              </button>
            </div>
            <table class="w-full text-sm">
              <thead>
                <tr>
                  <th class="text-left">#</th>
                  <th class="text-left">Item</th>
                  <th class="text-right">Qty</th>
                </tr>
              </thead>
              <tbody>
                <For each={s().lines ?? []}>
                  {(ln) => (
                    <tr>
                      <td>{ln.line_no}</td>
                      <td>{ln.item_code ?? ln.id}</td>
                      <td class="text-right">{ln.qty}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
            <button type="button" class="btn btn-primary" disabled={busy()} onClick={() => void complete()}>
              Complete pack
            </button>
          </div>
        )}
      </Show>
    </SerialLotLayout>
  );
}
