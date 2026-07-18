import { createSignal, For, Show } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { usePayPeriods } from "../../shared/useHr";
import { exportRemittanceCsv } from "../../shared/hrCsvImport";
import { useToast } from "../../shared/toast";
import { useDocumentDraft } from "../../shared/useDocumentDraft";
import { DRAFT_ENTITY } from "../../shared/entityTypes";
import { Field, inputClass, SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { HrLayout } from "./HrLayout";
import { formatAmount } from "../../shared/money";

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
  const [exportFormat, setExportFormat] = createSignal("sss");

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
    try {
      await exportRemittanceCsv(id, exportFormat());
    } catch {
      toast.warning("CSV export failed.");
    }
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
      <section class="mb-6 rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h2 class="mb-2 text-lg font-medium">Build remittance batch</h2>
        <p class="mb-3 text-sm text-text-secondary">
          Creates or refreshes an agency remittance file from posted payslips for the selected period (SSS, PhilHealth,
          Pag-IBIG, or BIR withholding).
        </p>
        <draft.DraftBanner />
        <div class="grid gap-3 sm:grid-cols-4">
          <Field label="Pay period">
            <select
              class={inputClass}
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
          </Field>
          <Field label="Agency">
            <select class={inputClass} value={agency()} onChange={(e) => setAgency(e.currentTarget.value)}>
              <For each={[...AGENCIES]}>{(a) => <option value={a.id}>{a.label}</option>}</For>
            </select>
          </Field>
          <div class="flex items-end sm:col-span-2">
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              disabled={building()}
              onClick={() => void build()}
            >
              {building() ? "Building…" : "Build batch"}
            </button>
          </div>
        </div>
      </section>

      <section class="mb-6">
        <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-lg font-medium">Batches</h2>
          <div class="flex items-center gap-2 text-sm">
            <span class="text-text-secondary">Export format</span>
            <select
              class="rounded-lg border border-stroke px-2 py-1 text-sm"
              value={exportFormat()}
              onChange={(e) => setExportFormat(e.currentTarget.value)}
            >
              <option value="sss_r3">SSS R3-style</option>
              <option value="philhealth_erf">PhilHealth ERF-style</option>
              <option value="pagibig_mcrf">Pag-IBIG MCRF-style</option>
              <option value="bir_1601c">BIR 1601-C style</option>
              <option value="generic">Generic</option>
            </select>
          </div>
        </div>
        <SpreadsheetGrid
          columns={[
            { key: "agency", header: "Agency", render: (batch) => <span class="uppercase">{batch.agency}</span> },
            { key: "period_label", header: "Period" },
            { key: "status", header: "Status" },
            { key: "total_employee", header: "EE", render: (batch) => <span class="tabular-nums">{formatAmount(batch.total_employee)}</span> },
            { key: "total_employer", header: "ER", render: (batch) => <span class="tabular-nums">{formatAmount(batch.total_employer)}</span> },
            { key: "total_amount", header: "Total", render: (batch) => <span class="tabular-nums">{formatAmount(batch.total_amount)}</span> },
            {
              key: "actions",
              header: "Actions",
              clickable: false,
              render: (batch) => (
                <div class="flex flex-wrap gap-2">
                  <button type="button" class="text-brand-700 underline" onClick={() => setSelectedId(batch.id)}>View</button>
                  <button type="button" class="text-brand-700 underline" onClick={() => void exportCsv(batch.id)}>CSV</button>
                  <button type="button" class="text-text-secondary underline" onClick={() => void markStatus(batch.id, "filed")}>Filed</button>
                  <button type="button" class="text-text-secondary underline" onClick={() => void markStatus(batch.id, "paid")}>Paid</button>
                </div>
              ),
            },
          ]}
          rows={list.data ?? []}
          loading={list.isFetching}
          selectedId={selectedId()}
          onSelect={setSelectedId}
          onEdit={(batch) => setSelectedId(batch.id)}
          onNew={() => {}}
          showNew={false}
          codeKey="agency"
          nameKey="period_label"
          page={1}
          pageSize={50}
          total={(list.data ?? []).length}
        />
      </section>

      <Show when={detail.data}>
        {(d) => (
          <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
            <h2 class="mb-2 text-lg font-medium">
              Lines — {d().batch.agency.toUpperCase()} ({d().lines.length})
            </h2>
            <div class="overflow-auto rounded-lg border border-stroke">
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
                        <td class="px-3 py-2 text-right tabular-nums">{formatAmount(Number(ln.ee_amount))}</td>
                        <td class="px-3 py-2 text-right tabular-nums">{formatAmount(Number(ln.er_amount))}</td>
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
