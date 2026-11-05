import { createMemo, createSignal, For, Show } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { usePayPeriods } from "../../shared/useHr";
import { exportRemittanceCsv } from "../../shared/hrCsvImport";
import { useToast } from "../../shared/toast";
import { useDocumentDraft } from "../../shared/useDocumentDraft";
import { DRAFT_ENTITY } from "../../shared/entityTypes";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { HrLayout } from "./HrLayout";
import { HrPayrollTabs } from "./HrPayrollTabs";
import { HrBadge, HrEmpty, HrPageHead, HrTcard, type HrBadgeTone } from "./HrUi";
import { formatAmount, formatPeso } from "../../shared/money";

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
  { id: "sss", label: "SSS", form: "Contribution (R3 file)" },
  { id: "philhealth", label: "PhilHealth", form: "RF-1 / premium" },
  { id: "pagibig", label: "Pag-IBIG", form: "MCRF" },
  { id: "bir", label: "BIR", form: "1601-C withholding" },
] as const;

function agencyLabel(id: string) {
  return AGENCIES.find((a) => a.id === id)?.label ?? id.toUpperCase();
}

function formLabel(id: string) {
  return AGENCIES.find((a) => a.id === id)?.form ?? "—";
}

function statusTone(status: string): HrBadgeTone {
  const s = status.toLowerCase();
  if (s === "filed" || s === "paid") return "success";
  if (s === "ready" || s === "draft") return "warning";
  return "neutral";
}

function statusLabel(status: string) {
  if (!status) return "Not started";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function RemittancesPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const periods = usePayPeriods();
  const [periodId, setPeriodId] = createSignal<number | null>(null);
  const [agency, setAgency] = createSignal("sss");
  const [building, setBuilding] = createSignal(false);
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [exportFormat, setExportFormat] = createSignal("sss_r3");
  const [buildOpen, setBuildOpen] = createSignal(false);
  const [payOpen, setPayOpen] = createSignal(false);
  const [payTarget, setPayTarget] = createSignal<RemittanceBatch | null>(null);
  const [agencySeg, setAgencySeg] = createSignal("");
  const [search, setSearch] = createSignal("");

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

  const rows = createMemo(() => {
    const q = search().trim().toLowerCase();
    return (list.data ?? []).filter((batch) => {
      if (agencySeg() && batch.agency !== agencySeg()) return false;
      if (!q) return true;
      return (
        batch.agency.toLowerCase().includes(q) ||
        batch.period_label.toLowerCase().includes(q) ||
        batch.status.toLowerCase().includes(q)
      );
    });
  });

  const draft = useDocumentDraft({
    entityType: DRAFT_ENTITY.hrRemittance,
    draftKey: "build",
    getPayload: () => ({ period_id: periodId(), agency: agency() }),
    onApply: (payload) => {
      setPeriodId(payload.period_id);
      setAgency(payload.agency);
    },
    enabled: () => buildOpen(),
    localOnly: true,
    autoApply: () => false,
  });

  const build = async () => {
    if (!periodId()) return toast.warning("Select a pay period.");
    setBuilding(true);
    const res = await apiFetch<{ batch_id: number }>("/api/v1/hr/remittances/build", {
      method: "POST",
      body: JSON.stringify({ pay_period_id: periodId(), agency: agency() }),
    });
    setBuilding(false);
    if (!res.success) return toast.warning(res.message ?? "Build failed.");
    toast.success("Remittance batch ready.");
    setSelectedId(res.data?.batch_id ?? null);
    await draft.clearOnSave();
    void qc.invalidateQueries({ queryKey: ["hr-remittances"] });
    setBuildOpen(false);
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
    if (!res.success) return toast.warning(res.message ?? "Update failed.");
    void qc.invalidateQueries({ queryKey: ["hr-remittances"] });
    void qc.invalidateQueries({ queryKey: ["hr-remittance", id] });
    toast.success(`Marked ${status}.`);
    setPayOpen(false);
    setPayTarget(null);
  };

  return (
    <HrLayout>
      <div class="hr-crumb">HR &amp; Payroll › Payroll › Remittances</div>
      <HrPayrollTabs />
      <HrPageHead
        title="Remittances"
        subtitle="Government contributions and tax due per month."
        actions={
          <button type="button" class="hr-btn hr-btn-primary" onClick={() => setBuildOpen(true)}>
            Generate…
          </button>
        }
      />

      <HrTcard
        toolbar={
          <>
            <input
              class="grow rounded-lg border border-stroke bg-surface px-3 py-2 text-sm"
              placeholder="Search…"
              aria-label="Search"
              value={search()}
              onInput={(e) => setSearch(e.currentTarget.value)}
            />
            <div class="hr-seg" role="group" aria-label="Agency">
              <button type="button" classList={{ on: agencySeg() === "" }} onClick={() => setAgencySeg("")}>
                All
              </button>
              <For each={[...AGENCIES]}>
                {(a) => (
                  <button type="button" classList={{ on: agencySeg() === a.id }} onClick={() => setAgencySeg(a.id)}>
                    {a.label}
                  </button>
                )}
              </For>
            </div>
            <select
              class="rounded-lg border border-stroke bg-surface px-2 text-sm"
              aria-label="Export format"
              value={exportFormat()}
              onChange={(e) => setExportFormat(e.currentTarget.value)}
            >
              <option value="sss_r3">SSS R3-style</option>
              <option value="philhealth_erf">PhilHealth ERF-style</option>
              <option value="pagibig_mcrf">Pag-IBIG MCRF-style</option>
              <option value="bir_1601c">BIR 1601-C style</option>
              <option value="generic">Generic</option>
            </select>
          </>
        }
      >
        <div class="hr-tbl-wrap">
          <table class="hr-tbl">
            <thead>
              <tr>
                <th>Agency</th>
                <th>Month</th>
                <th>Form</th>
                <th class="num">Amount</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              <For
                each={rows()}
                fallback={
                  <tr>
                    <td colspan="6">
                      <HrEmpty title="No matches" hint="Generate a remittance batch from a posted pay period." />
                    </td>
                  </tr>
                }
              >
                {(batch) => (
                  <tr>
                    <td>
                      <HrBadge tone="neutral">{agencyLabel(batch.agency)}</HrBadge>
                    </td>
                    <td>{batch.period_label}</td>
                    <td>{formLabel(batch.agency)}</td>
                    <td class="num">{formatPeso(batch.total_amount)}</td>
                    <td>
                      <HrBadge tone={statusTone(batch.status)}>{statusLabel(batch.status)}</HrBadge>
                    </td>
                    <td>
                      <details class="hr-menu hr-rowmenu">
                        <summary class="hr-rowmenu-btn" aria-label="Row actions">
                          ⋯
                        </summary>
                        <div>
                          <button type="button" class="menu-item" onClick={() => setSelectedId(batch.id)}>
                            Open
                          </button>
                          <button
                            type="button"
                            class="menu-item"
                            onClick={() => {
                              setPayTarget(batch);
                              setPayOpen(true);
                            }}
                          >
                            Mark filed
                          </button>
                          <button type="button" class="menu-item" onClick={() => void exportCsv(batch.id)}>
                            Download
                          </button>
                          <button type="button" class="menu-item" onClick={() => void markStatus(batch.id, "paid")}>
                            Mark paid
                          </button>
                        </div>
                      </details>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </HrTcard>

      <Show when={selectedId() != null ? detail.data : undefined}>
        {(d) => (
          <section class="hr-w s12 mt-4" aria-label="Remittance lines">
            <header>
              <h3>
                Lines · {agencyLabel(d().batch.agency)} · {d().batch.period_label}
              </h3>
              <span class="grow" />
              <button type="button" class="hr-btn hr-btn-sm" onClick={() => setSelectedId(null)}>
                Close
              </button>
            </header>
            <div class="hr-tbl-wrap">
              <table class="hr-tbl">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Gov ID</th>
                    <th class="num">EE</th>
                    <th class="num">ER</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={d().lines}>
                    {(ln) => (
                      <tr>
                        <td>
                          {String(ln.employee_no)} — {String(ln.employee_name)}
                        </td>
                        <td>{String(ln.gov_id || "—")}</td>
                        <td class="num">{formatAmount(Number(ln.ee_amount))}</td>
                        <td class="num">{formatAmount(Number(ln.er_amount))}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </section>
        )}
      </Show>

      <Show when={buildOpen()}>
        <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="Generate remittance">
          <div class="w-full max-w-md rounded-lg border border-stroke bg-surface p-4 shadow-lg">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold">Generate remittance</h2>
              <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setBuildOpen(false)}>
                ✕
              </button>
            </div>
            <draft.DraftBanner />
            <div class="grid gap-3">
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
            </div>
            <div class="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" class="hr-btn" onClick={() => setBuildOpen(false)}>
                Cancel
              </button>
              <button type="button" class="hr-btn hr-btn-primary" disabled={building()} onClick={() => void build()}>
                Generate
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={payOpen() && payTarget()}>
        {(batch) => (
          <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="Mark filed">
            <div class="w-full max-w-md rounded-lg border border-stroke bg-surface p-4 shadow-lg">
              <div class="mb-3 flex items-center justify-between gap-2">
                <h2 class="text-sm font-semibold">Mark filed?</h2>
                <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setPayOpen(false)}>
                  ✕
                </button>
              </div>
              <p class="mb-3 text-sm">
                {agencyLabel(batch().agency)} · {batch().period_label} · {formatPeso(batch().total_amount)}
              </p>
              <div class="mt-4 flex flex-wrap justify-end gap-2">
                <button type="button" class="hr-btn" onClick={() => setPayOpen(false)}>
                  Cancel
                </button>
                <button type="button" class="hr-btn hr-btn-primary" onClick={() => void markStatus(batch().id, "filed")}>
                  Mark filed
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>
    </HrLayout>
  );
}
