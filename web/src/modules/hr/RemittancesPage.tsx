import { createSignal, For, Show } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch, getAccessToken } from "../../shared/api";
import { usePayPeriods } from "../../shared/useHr";
import { useToast } from "../../shared/toast";
import { useDocumentDraft } from "../../shared/useDocumentDraft";
import { DRAFT_ENTITY } from "../../shared/entityTypes";
import { HrLayout } from "./HrLayout";

type RemittanceBatch = {
  id: number;
  pay_period_id: number;
  agency: string;
  period_label: string;
  status: string;
  total_employee: number;
  total_employer: number;
  total_amount: number;
  line_count?: number;
};

const AGENCIES = [
  { id: "sss", label: "SSS" },
  { id: "philhealth", label: "PhilHealth" },
  { id: "pagibig", label: "Pag-IBIG" },
  { id: "bir", label: "BIR (WHT)" },
] as const;

export default function RemittancesPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const periods = usePayPeriods();
  const [periodId, setPeriodId] = createSignal<number | null>(null);
  const [agency, setAgency] = createSignal("sss");
  const [building, setBuilding] = createSignal(false);
  const [selectedId, setSelectedId] = createSignal<number | null>(null);

  const list = createQuery(() => ({
    queryKey: ["hr-remittances"],
    queryFn: async () => {
      const res = await apiFetch<RemittanceBatch[]>("/api/v1/hr/remittances?page=1&pageSize=50");
      if (!res.success) throw new Error(res.message ?? "Failed to load remittances");
      return res.data ?? [];
    },
  }));

  const detail = createQuery(() => {
    const id = selectedId();
    return {
      queryKey: ["hr-remittance", id],
      enabled: id != null && id > 0,
      queryFn: async () => {
        const res = await apiFetch<{ batch: RemittanceBatch; lines: Array<Record<string, unknown>> }>(
          `/api/v1/hr/remittances/${id}`,
        );
        if (!res.success) throw new Error(res.message ?? "Failed to load batch");
        return res.data!;
      },
    };
  });

  const buildDraftPayload = () => ({
    period_id: periodId(),
    agency: agency(),
  });

  const applyDraftPayload = (payload: ReturnType<typeof buildDraftPayload>) => {
    setPeriodId(payload.period_id);
    setAgency(payload.agency);
  };

  const draft = useDocumentDraft({
    entityType: DRAFT_ENTITY.hrRemittance,
    draftKey: "build",
    getPayload: buildDraftPayload,
    onApply: applyDraftPayload,
    enabled: () => true,
    localOnly: true,
    autoApply: () => true,
  });

  const build = async () => {
    if (!periodId()) {
      toast.warning("Select a pay period.");
      return;
    }
    setBuilding(true);
    const res = await apiFetch<{ batch_id: number }>("/api/v1/hr/remittances/build", {
      method: "POST",
      body: JSON.stringify({ pay_period_id: periodId(), agency: agency() }),
    });
    setBuilding(false);
    if (!res.success) {
      toast.warning(res.message ?? "Build failed.");
      return;
    }
    toast.success("Remittance batch ready.");
    setSelectedId(res.data?.batch_id ?? null);
    await draft.clearOnSave();
    void qc.invalidateQueries({ queryKey: ["hr-remittances"] });
  };

  const exportCsv = async (id: number) => {
    const token = await getAccessToken();
    const res = await fetch(`/api/v1/hr/remittances/${id}/export.csv`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      toast.warning("CSV export failed.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `remittance-${id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const markStatus = async (id: number, status: string) => {
    const res = await apiFetch(`/api/v1/hr/remittances/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    if (!res.success) {
      toast.warning(res.message ?? "Update failed.");
      return;
    }
    void qc.invalidateQueries({ queryKey: ["hr-remittances"] });
    void qc.invalidateQueries({ queryKey: ["hr-remittance", id] });
    toast.success(`Marked ${status}.`);
  };

  return (
    <HrLayout>
      <section class="mb-6 rounded-lg border border-stroke bg-surface p-4">
        <h2 class="mb-2 text-lg font-medium">Build remittance batch</h2>
        <p class="mb-3 text-sm text-muted">
          Creates or refreshes an agency remittance file from posted payslips for the selected period (SSS, PhilHealth,
          Pag-IBIG, or BIR withholding).
        </p>
        <draft.DraftBanner />
        <div class="grid gap-3 sm:grid-cols-4">
          <div>
            <label class="mb-1 block text-sm">Pay period</label>
            <select
              class="w-full rounded border px-3 py-2"
              value={periodId() ?? ""}
              onChange={(e) => setPeriodId(e.currentTarget.value ? Number(e.currentTarget.value) : null)}
            >
              <option value="">Select…</option>
              <For each={periods.data ?? []}>
                {(p) => (
                  <option value={p.id}>
                    {p.period_label} ({p.status})
                  </option>
                )}
              </For>
            </select>
          </div>
          <div>
            <label class="mb-1 block text-sm">Agency</label>
            <select class="w-full rounded border px-3 py-2" value={agency()} onChange={(e) => setAgency(e.currentTarget.value)}>
              <For each={[...AGENCIES]}>{(a) => <option value={a.id}>{a.label}</option>}</For>
            </select>
          </div>
          <div class="flex items-end sm:col-span-2">
            <button
              type="button"
              class="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
              disabled={building()}
              onClick={() => void build()}
            >
              {building() ? "Building…" : "Build batch"}
            </button>
          </div>
        </div>
      </section>

      <section class="mb-6">
        <h2 class="mb-2 text-lg font-medium">Batches</h2>
        <div class="overflow-auto rounded border">
          <table class="min-w-full text-sm">
            <thead class="bg-slate-50 text-left">
              <tr>
                <th class="px-3 py-2">Agency</th>
                <th class="px-3 py-2">Period</th>
                <th class="px-3 py-2">Status</th>
                <th class="px-3 py-2 text-right">EE</th>
                <th class="px-3 py-2 text-right">ER</th>
                <th class="px-3 py-2 text-right">Total</th>
                <th class="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              <For each={list.data ?? []} fallback={<tr><td class="px-3 py-3 text-muted" colspan="7">No batches yet.</td></tr>}>
                {(b) => (
                  <tr class="border-t" classList={{ "bg-blue-50": selectedId() === b.id }}>
                    <td class="px-3 py-2 uppercase">{b.agency}</td>
                    <td class="px-3 py-2">{b.period_label}</td>
                    <td class="px-3 py-2">{b.status}</td>
                    <td class="px-3 py-2 text-right tabular-nums">{b.total_employee.toFixed(2)}</td>
                    <td class="px-3 py-2 text-right tabular-nums">{b.total_employer.toFixed(2)}</td>
                    <td class="px-3 py-2 text-right tabular-nums">{b.total_amount.toFixed(2)}</td>
                    <td class="px-3 py-2">
                      <div class="flex flex-wrap gap-2">
                        <button type="button" class="text-blue-700 underline" onClick={() => setSelectedId(b.id)}>
                          View
                        </button>
                        <button type="button" class="text-blue-700 underline" onClick={() => void exportCsv(b.id)}>
                          CSV
                        </button>
                        <button type="button" class="text-slate-600 underline" onClick={() => void markStatus(b.id, "filed")}>
                          Filed
                        </button>
                        <button type="button" class="text-slate-600 underline" onClick={() => void markStatus(b.id, "paid")}>
                          Paid
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </section>

      <Show when={detail.data}>
        {(d) => (
          <section>
            <h2 class="mb-2 text-lg font-medium">
              Lines — {d().batch.agency.toUpperCase()} ({d().lines.length})
            </h2>
            <div class="overflow-auto rounded border">
              <table class="min-w-full text-sm">
                <thead class="bg-slate-50 text-left">
                  <tr>
                    <th class="px-3 py-2">Employee</th>
                    <th class="px-3 py-2">Gov ID</th>
                    <th class="px-3 py-2 text-right">EE</th>
                    <th class="px-3 py-2 text-right">ER</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={d().lines}>
                    {(ln) => (
                      <tr class="border-t">
                        <td class="px-3 py-2">
                          {String(ln.employee_no)} — {String(ln.employee_name)}
                        </td>
                        <td class="px-3 py-2">{String(ln.gov_id || "—")}</td>
                        <td class="px-3 py-2 text-right tabular-nums">{Number(ln.ee_amount).toFixed(2)}</td>
                        <td class="px-3 py-2 text-right tabular-nums">{Number(ln.er_amount).toFixed(2)}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </section>
        )}
      </Show>
    </HrLayout>
  );
}
