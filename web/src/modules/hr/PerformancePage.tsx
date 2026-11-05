import { createSignal, For, Show } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { fetchEmployeeOptions } from "../../shared/useHr";
import { LookupCombo } from "../../shared/LookupCombo";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { SignaturePad } from "../../shared/SignaturePad";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";
import { HrPerformanceTabs } from "./HrPerformanceTabs";
import { HrBadge, HrEmpty, HrPageHead, type HrBadgeTone } from "./HrUi";

type Cycle = { id: number; name: string; period_start: string; period_end: string; status: string };
type Review = {
  id: number;
  employee_id?: number;
  employee_no?: string;
  employee_name?: string;
  status: string;
  self_comments: string;
  manager_comments: string;
  overall_score?: number | null;
  scores_json?: Record<string, number>;
  review_source?: string;
  period_end?: string;
  acknowledged_at?: string | null;
};

const SCORE_FIELDS = [
  ["attendance_punctuality", "Attendance and punctuality"],
  ["job_performance", "Job performance"],
  ["work_attitude", "Work attitude and professionalism"],
  ["communication", "Communication"],
  ["following_instructions", "Following reasonable work instructions"],
] as const;

function cycleStatusTone(status: string): HrBadgeTone {
  return status === "closed" ? "neutral" : "warning";
}

function cycleStatusLabel(status: string) {
  if (!status) return "—";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatPeriod(start: string, end: string) {
  if (!start && !end) return "—";
  if (start && end) return `${start.slice(0, 7)} – ${end.slice(0, 7)}`;
  return start || end;
}

function ScorePips(props: { score: number | null | undefined }) {
  const n = () => Math.max(0, Math.min(5, Math.round(Number(props.score) || 0)));
  return (
    <span class="hr-score" aria-label={`${props.score ?? 0} of 5`}>
      <For each={[1, 2, 3, 4, 5]}>{(i) => <i classList={{ f: i <= n() }} />}</For>
    </span>
  );
}

function ScoreSeg(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div class="fld mb-3">
      <label class="mb-1 block text-sm font-medium">{props.label}</label>
      <div class="hr-seg" role="radiogroup" aria-label={props.label}>
        <For each={["1", "2", "3", "4", "5"]}>
          {(v) => (
            <button type="button" classList={{ on: props.value === v }} onClick={() => props.onChange(v)}>
              {v}
            </button>
          )}
        </For>
      </div>
      <div class="hr-muted mt-1">1 Poor · 5 Excellent</div>
    </div>
  );
}

export default function PerformancePage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = createSignal("");
  const [start, setStart] = createSignal("");
  const [end, setEnd] = createSignal("");
  const [cycleId, setCycleId] = createSignal<number | null>(null);
  const [editId, setEditId] = createSignal<number | null>(null);
  const [scores, setScores] = createSignal<Record<string, string>>({});
  const [comments, setComments] = createSignal("");
  const [signOff, setSignOff] = createSignal(false);
  const [clientOpen, setClientOpen] = createSignal(false);
  const [clientEmpId, setClientEmpId] = createSignal<number | null>(null);
  const [clientEmpLabel, setClientEmpLabel] = createSignal("");
  const [clientScores, setClientScores] = createSignal<Record<string, string>>(
    Object.fromEntries(SCORE_FIELDS.map(([k]) => [k, "4"])),
  );
  const [clientNotes, setClientNotes] = createSignal("");
  const [ackId, setAckId] = createSignal<number | null>(null);
  const [signedName, setSignedName] = createSignal("");
  const [sigUrl, setSigUrl] = createSignal<string | null>(null);
  const [cycleOpen, setCycleOpen] = createSignal(false);
  const [busy, setBusy] = createSignal(false);

  const cycles = createQuery(() => ({
    queryKey: ["hr-review-cycles"],
    queryFn: async () => (await apiFetch<Cycle[]>("/api/v1/hr/performance/cycles")).data ?? [],
  }));
  const reviews = createQuery(() => ({
    queryKey: ["hr-reviews", cycleId()],
    enabled: !!cycleId(),
    queryFn: async () => (await apiFetch<Review[]>(`/api/v1/hr/performance/reviews?cycle_id=${cycleId()}`)).data ?? [],
  }));
  const clientReviews = createQuery(() => ({
    queryKey: ["hr-client-reviews"],
    queryFn: async () => (await apiFetch<Review[]>("/api/v1/hr/performance/reviews?source=client")).data ?? [],
  }));

  const createCycle = async () => {
    if (!name().trim() || !start() || !end()) return toast.warning("Name and period required.");
    setBusy(true);
    const res = await apiFetch<Cycle>("/api/v1/hr/performance/cycles", {
      method: "POST",
      body: JSON.stringify({ name: name().trim(), period_start: start(), period_end: end(), cycle_kind: "annual" }),
    });
    setBusy(false);
    if (!res.success) return toast.warning(res.message ?? "Failed.");
    toast.success("Cycle created.");
    setCycleOpen(false);
    setName("");
    setStart("");
    setEnd("");
    setCycleId(res.data?.id ?? null);
    void qc.invalidateQueries({ queryKey: ["hr-review-cycles"] });
  };

  const assign = async () => {
    const id = cycleId();
    if (!id) return;
    const res = await apiFetch(`/api/v1/hr/performance/cycles/${id}/assign`, { method: "POST", body: "{}" });
    if (!res.success) return toast.warning(res.message ?? "Failed.");
    toast.success("Reviews assigned.");
    void qc.invalidateQueries({ queryKey: ["hr-reviews"] });
  };

  const openEvaluate = (r: Review) => {
    setEditId(r.id);
    setScores(Object.fromEntries(SCORE_FIELDS.map(([key]) => [key, String(r.scores_json?.[key] ?? "")])));
    setComments(r.manager_comments || "");
    setSignOff(false);
  };

  const saveManager = async () => {
    const id = editId();
    if (!id) return;
    if (!signOff()) return toast.warning("Confirm evaluator sign-off before submit.");
    for (const [key] of SCORE_FIELDS) {
      const v = Number(scores()[key]);
      if (!v || v < 1 || v > 5) return toast.warning("Score each criterion 1–5.");
    }
    setBusy(true);
    const scoresJson = Object.fromEntries(SCORE_FIELDS.map(([key]) => [key, Number(scores()[key])]));
    const res = await apiFetch(`/api/v1/hr/performance/reviews/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        manager_comments: comments(),
        scores_json: scoresJson,
        status: "manager_done",
      }),
    });
    setBusy(false);
    if (!res.success) return toast.warning(res.message ?? "Failed.");
    toast.success("Evaluation saved. Employee signs on My HR.");
    setEditId(null);
    void qc.invalidateQueries({ queryKey: ["hr-reviews"] });
  };

  const saveClient = async () => {
    if (!clientEmpId()) return toast.warning("Choose an employee.");
    for (const [key] of SCORE_FIELDS) {
      const v = Number(clientScores()[key]);
      if (!v || v < 1 || v > 5) return toast.warning("Score each criterion 1–5.");
    }
    setBusy(true);
    const scoresPayload = Object.fromEntries(SCORE_FIELDS.map(([key]) => [key, Number(clientScores()[key])]));
    const res = await apiFetch("/api/v1/hr/performance/reviews/client", {
      method: "POST",
      body: JSON.stringify({ employee_id: clientEmpId(), scores: scoresPayload, notes: clientNotes() }),
    });
    setBusy(false);
    if (!res.success) return toast.warning(res.message ?? "Could not save the client evaluation.");
    toast.success("Client evaluation saved.");
    setClientOpen(false);
    setClientNotes("");
    void qc.invalidateQueries({ queryKey: ["hr-client-reviews"] });
  };

  const submitAck = async () => {
    const id = ackId();
    if (!id) return;
    if (!sigUrl()) return toast.warning("Draw a signature before acknowledging.");
    if (!signedName().trim()) return toast.warning("Typed name is required.");
    setBusy(true);
    const res = await apiFetch(`/api/v1/hr/performance/reviews/${id}/acknowledge`, {
      method: "POST",
      body: JSON.stringify({
        signature_data_url: sigUrl(),
        signed_name: signedName().trim(),
      }),
    });
    setBusy(false);
    if (!res.success) return toast.warning(res.message ?? "Failed.");
    toast.success("Acknowledged with signature — stored in 201.");
    setAckId(null);
    setSigUrl(null);
    setSignedName("");
    void qc.invalidateQueries({ queryKey: ["hr-reviews"] });
    void qc.invalidateQueries({ queryKey: ["hr-client-reviews"] });
  };

  return (
    <HrLayout>
      <div class="hr-crumb">HR &amp; Payroll › Performance › Evaluations &amp; learning › Evaluations</div>
      <HrPerformanceTabs />
      <HrPageHead
        title="Evaluations"
        subtitle="Review cycles and client evaluations (template LMSI_5). Scores never change pay, assignment or status."
        actions={
          <div class="hr-actions">
            <button type="button" class="hr-btn hr-btn-primary" onClick={() => setCycleOpen(true)}>
              + New cycle
            </button>
          </div>
        }
      />

      <div class="grid gap-4 lg:grid-cols-2">
        <section class="hr-w s12" aria-label="Review cycles">
          <header>
            <h3>Review cycles</h3>
            <span class="grow" />
            <Show when={cycleId()}>
              <button type="button" class="hr-btn hr-btn-sm" onClick={() => void assign()}>
                Assign employees
              </button>
            </Show>
          </header>
          <div class="hr-tbl-wrap">
            <table class="hr-tbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Period</th>
                </tr>
              </thead>
              <tbody>
                <For
                  each={cycles.data ?? []}
                  fallback={
                    <tr>
                      <td colspan="3">
                        <HrEmpty title="No cycles" hint="Create a review cycle to start." />
                      </td>
                    </tr>
                  }
                >
                  {(c) => (
                    <tr
                      classList={{ "bg-brand-50": cycleId() === c.id }}
                      style={{ cursor: "pointer" }}
                      onClick={() => setCycleId(c.id)}
                    >
                      <td class="font-semibold">{c.name}</td>
                      <td>
                        <HrBadge tone={cycleStatusTone(c.status)}>{cycleStatusLabel(c.status)}</HrBadge>
                      </td>
                      <td>{formatPeriod(c.period_start, c.period_end)}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
          <Show when={cycleId()}>
            <div class="border-t border-stroke p-3">
              <h4 class="mb-2 text-sm font-semibold">Reviews in cycle</h4>
              <For each={reviews.data ?? []} fallback={<p class="hr-muted text-sm">No reviews — assign employees first.</p>}>
                {(r) => (
                  <div class="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 py-2 text-sm">
                    <div>
                      <div class="font-medium">
                        {r.employee_name} <span class="hr-muted">{r.employee_no}</span>
                      </div>
                      <div class="hr-muted">
                        {r.status} · score {r.overall_score ?? "—"}
                        <Show when={r.overall_score != null}>
                          <ScorePips score={r.overall_score} />
                        </Show>
                      </div>
                    </div>
                    <div class="flex flex-wrap gap-1">
                      <button type="button" class="hr-btn hr-btn-primary hr-btn-sm" onClick={() => openEvaluate(r)}>
                        Evaluate…
                      </button>
                      <button
                        type="button"
                        class="hr-btn hr-btn-sm"
                        onClick={() =>
                          void apiFetch(`/api/v1/hr/performance/reviews/${r.id}/store-201`, { method: "POST", body: "{}" }).then((res) => {
                            if (!res.success) toast.warning(res.message ?? "Failed.");
                            else toast.success("Stored in 201.");
                          })
                        }
                      >
                        Store 201
                      </button>
                      <button
                        type="button"
                        class="hr-btn hr-btn-sm"
                        onClick={() => {
                          setAckId(r.id);
                          setSignedName(r.employee_name ?? "");
                          setSigUrl(null);
                        }}
                      >
                        Acknowledge
                      </button>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </section>

        <section class="hr-w s12" aria-label="Client evaluations">
          <header>
            <h3>Client evaluations</h3>
            <span class="grow" />
            <button type="button" class="hr-btn hr-btn-sm" onClick={() => setClientOpen(true)}>
              Add client evaluation
            </button>
          </header>
          <div class="hr-tbl-wrap">
            <table class="hr-tbl">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Score</th>
                  <th>Notes</th>
                  <th>Signed by employee</th>
                </tr>
              </thead>
              <tbody>
                <For
                  each={clientReviews.data ?? []}
                  fallback={
                    <tr>
                      <td colspan="4">
                        <HrEmpty title="No client evaluations" hint="Add a client evaluation to start." />
                      </td>
                    </tr>
                  }
                >
                  {(r) => (
                    <tr>
                      <td class="font-semibold">{r.employee_name}</td>
                      <td>
                        {r.overall_score != null ? `${Number(r.overall_score).toFixed(1)} / 5` : "—"}
                        <ScorePips score={r.overall_score} />
                      </td>
                      <td>{r.manager_comments || "—"}</td>
                      <td>
                        <Show when={r.acknowledged_at || r.status === "acknowledged"} fallback={<HrBadge tone="warning">Due</HrBadge>}>
                          <HrBadge tone="success">Signed</HrBadge>
                        </Show>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <Show when={cycleOpen()}>
        <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="New review cycle">
          <div class="w-full max-w-md rounded-lg border border-stroke bg-surface p-4 shadow-lg">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold">New review cycle</h2>
              <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setCycleOpen(false)}>
                ✕
              </button>
            </div>
            <div class="grid gap-3">
              <Field label="Name">
                <input class={inputClass} value={name()} onInput={(e) => setName(e.currentTarget.value)} />
              </Field>
              <Field label="Period start">
                <input type="date" class={inputClass} value={start()} onInput={(e) => setStart(e.currentTarget.value)} />
              </Field>
              <Field label="Period end">
                <input type="date" class={inputClass} value={end()} onInput={(e) => setEnd(e.currentTarget.value)} />
              </Field>
            </div>
            <div class="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" class="hr-btn" onClick={() => setCycleOpen(false)}>
                Cancel
              </button>
              <button type="button" class="hr-btn hr-btn-primary" disabled={busy()} onClick={() => void createCycle()}>
                Save
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={clientOpen()}>
        <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="Add client evaluation">
          <div class="max-h-[90vh] w-full max-w-lg overflow-auto rounded-lg border border-stroke bg-surface p-4 shadow-lg">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold">Add client evaluation</h2>
              <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setClientOpen(false)}>
                ✕
              </button>
            </div>
            <LookupCombo
              label="Employee"
              value={clientEmpLabel}
              selectedId={clientEmpId}
              onInput={setClientEmpLabel}
              onSelect={(o) => {
                setClientEmpId(o.id);
                setClientEmpLabel(o.label);
              }}
              onClear={() => {
                setClientEmpId(null);
                setClientEmpLabel("");
              }}
              fetchOptions={(q) => fetchEmployeeOptions(q, "active")}
              placeholder="Search employees…"
            />
            <p class="hr-muted mb-3 text-xs">Searchable picker; submits the same employee id as today.</p>
            <For each={SCORE_FIELDS}>
              {([key, label]) => (
                <ScoreSeg
                  label={label}
                  value={clientScores()[key] ?? ""}
                  onChange={(v) => setClientScores({ ...clientScores(), [key]: v })}
                />
              )}
            </For>
            <Field label="Notes">
              <textarea class={inputClass} rows={3} value={clientNotes()} onInput={(e) => setClientNotes(e.currentTarget.value)} />
            </Field>
            <div class="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" class="hr-btn" onClick={() => setClientOpen(false)}>
                Cancel
              </button>
              <button type="button" class="hr-btn hr-btn-primary" disabled={busy()} onClick={() => void saveClient()}>
                Save client evaluation
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={editId() != null}>
        <div
          class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Evaluation · LMSI_5"
        >
          <div class="max-h-[90vh] w-full max-w-lg overflow-auto rounded-lg border border-stroke bg-surface p-4 shadow-lg">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold">Evaluation · LMSI_5</h2>
              <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setEditId(null)}>
                ✕
              </button>
            </div>
            <p class="hr-muted mb-3 text-xs">Criteria match the live LMSI_5 template fields.</p>
            <For each={SCORE_FIELDS}>
              {([key, label]) => (
                <Field label={`${label} *`}>
                  <select
                    class={inputClass}
                    value={scores()[key] ?? ""}
                    onChange={(e) => setScores({ ...scores(), [key]: e.currentTarget.value })}
                  >
                    <option value="">—</option>
                    <For each={["1", "2", "3", "4", "5"]}>{(v) => <option value={v}>{v}</option>}</For>
                  </select>
                </Field>
              )}
            </For>
            <Field label="Comments">
              <textarea class={inputClass} rows={3} value={comments()} onInput={(e) => setComments(e.currentTarget.value)} />
            </Field>
            <label class="mt-3 flex items-start gap-2 text-sm">
              <input type="checkbox" checked={signOff()} onChange={(e) => setSignOff(e.currentTarget.checked)} class="mt-0.5" />
              <span>Evaluator sign-off: I confirm this evaluation. The employee signs on My HR.</span>
            </label>
            <p class="hr-muted mt-2 text-xs">Scores never change pay, assignment or status.</p>
            <div class="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" class="hr-btn" onClick={() => setEditId(null)}>
                Cancel
              </button>
              <button type="button" class="hr-btn hr-btn-primary" disabled={busy()} onClick={() => void saveManager()}>
                Sign &amp; submit
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={ackId() != null}>
        <div
          class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Acknowledge with signature"
        >
          <div class="w-full max-w-md rounded-lg border border-stroke bg-surface p-4 shadow-lg">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold">Acknowledge with signature</h2>
              <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setAckId(null)}>
                ✕
              </button>
            </div>
            <Field label="Full name (typed)">
              <input class={inputClass} value={signedName()} onInput={(e) => setSignedName(e.currentTarget.value)} />
            </Field>
            <div class="mt-3">
              <p class="mb-1 text-xs font-medium text-text-secondary">Draw signature</p>
              <SignaturePad onChange={(url) => setSigUrl(url)} />
            </div>
            <div class="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" class="hr-btn" onClick={() => setAckId(null)}>
                Cancel
              </button>
              <button type="button" class="hr-btn hr-btn-primary" disabled={busy()} onClick={() => void submitAck()}>
                Confirm acknowledgment
              </button>
            </div>
          </div>
        </div>
      </Show>
    </HrLayout>
  );
}
