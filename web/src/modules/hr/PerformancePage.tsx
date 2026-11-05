import { createSignal, For, Show } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { EntityModal, Field, inputClass } from "../../shared/SpreadsheetGrid";
import { Modal } from "../../shared/Modal";
import { SignaturePad } from "../../shared/SignaturePad";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";
import { HrPageHead } from "./HrUi";

type Cycle = { id: number; name: string; period_start: string; period_end: string; status: string };
type Review = {
  id: number; employee_id?: number; employee_no?: string; employee_name?: string; status: string;
  self_comments: string; manager_comments: string; overall_score?: number | null;
  scores_json?: Record<string, number>; review_source?: string; period_end?: string;
};

const SCORE_FIELDS = [
  ["attendance_punctuality", "Attendance and punctuality"],
  ["job_performance", "Job performance"],
  ["work_attitude", "Work attitude and professionalism"],
  ["communication", "Communication"],
  ["following_instructions", "Following reasonable work instructions"],
] as const;

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
  const [clientEmp, setClientEmp] = createSignal("");
  const [clientScores, setClientScores] = createSignal<Record<string, string>>({});
  const [clientNotes, setClientNotes] = createSignal("");
  const [ackId, setAckId] = createSignal<number | null>(null);
  const [signedName, setSignedName] = createSignal("");
  const [sigUrl, setSigUrl] = createSignal<string | null>(null);
  const [cycleOpen, setCycleOpen] = createSignal(false);

  const cycles = createQuery(() => ({
    queryKey: ["hr-review-cycles"],
    queryFn: async () => (await apiFetch<Cycle[]>("/api/v1/hr/performance/cycles")).data ?? [],
  }));
  const reviews = createQuery(() => ({
    queryKey: ["hr-reviews", cycleId()],
    enabled: !!cycleId(),
    queryFn: async () => (await apiFetch<Review[]>(`/api/v1/hr/performance/reviews?cycle_id=${cycleId()}`)).data ?? [],
  }));

  const createCycle = async () => {
    if (!name().trim() || !start() || !end()) return toast.warning("Name and period required.");
    const res = await apiFetch<Cycle>("/api/v1/hr/performance/cycles", {
      method: "POST",
      body: JSON.stringify({ name: name().trim(), period_start: start(), period_end: end(), cycle_kind: "annual" }),
    });
    if (!res.success) return toast.warning(res.message ?? "Failed.");
    toast.success("Cycle created.");
    setCycleOpen(false);
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

  const saveManager = async () => {
    const id = editId();
    if (!id) return;
    const scoresJson = Object.fromEntries(SCORE_FIELDS.map(([key]) => [key, Number(scores()[key])]));
    const res = await apiFetch(`/api/v1/hr/performance/reviews/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        manager_comments: comments(),
        scores_json: scoresJson,
        status: "manager_done",
      }),
    });
    if (!res.success) return toast.warning(res.message ?? "Failed.");
    toast.success("Saved.");
    setEditId(null);
    void qc.invalidateQueries({ queryKey: ["hr-reviews"] });
  };

  const submitAck = async () => {
    const id = ackId();
    if (!id) return;
    if (!sigUrl()) return toast.warning("Draw a signature before acknowledging.");
    if (!signedName().trim()) return toast.warning("Typed name is required.");
    const res = await apiFetch(`/api/v1/hr/performance/reviews/${id}/acknowledge`, {
      method: "POST",
      body: JSON.stringify({
        signature_data_url: sigUrl(),
        signed_name: signedName().trim(),
      }),
    });
    if (!res.success) return toast.warning(res.message ?? "Failed.");
    toast.success("Acknowledged with signature — stored in 201.");
    setAckId(null);
    setSigUrl(null);
    setSignedName("");
    void qc.invalidateQueries({ queryKey: ["hr-reviews"] });
  };

  return (
    <HrLayout>
      <HrPageHead title="Evaluations" subtitle="Review cycles and client evaluations. A score does not change pay, assignment, or status." />

      <button type="button" class="mb-4 rounded-lg bg-brand-600 px-4 py-2 text-sm text-white" onClick={() => setCycleOpen(true)}>
        New cycle
      </button>
      <EntityModal open={cycleOpen()} title="New cycle" onClose={() => setCycleOpen(false)} onSave={() => void createCycle()} saveLabel="Create cycle">
        <Field label="Name"><input class={inputClass} value={name()} onInput={(e) => setName(e.currentTarget.value)} /></Field>
        <Field label="Start"><input type="date" class={inputClass} value={start()} onInput={(e) => setStart(e.currentTarget.value)} /></Field>
        <Field label="End"><input type="date" class={inputClass} value={end()} onInput={(e) => setEnd(e.currentTarget.value)} /></Field>
      </EntityModal>

      <section class="mb-4 rounded-xl border border-stroke bg-surface p-4 shadow-sm">
        <h2 class="mb-3 text-lg font-medium">Cycles</h2>
        <div class="flex flex-wrap gap-2">
          <For each={cycles.data ?? []}>
            {(c) => (
              <button
                type="button"
                class="rounded-lg border border-stroke px-3 py-1.5 text-sm"
                classList={{ "border-brand-500 bg-brand-50": cycleId() === c.id }}
                onClick={() => setCycleId(c.id)}
              >
                {c.name} ({c.status})
              </button>
            )}
          </For>
        </div>
        <Show when={cycleId()}>
          <button type="button" class="mt-3 rounded-lg border border-stroke px-3 py-1.5 text-sm" onClick={() => void assign()}>
            Assign to all active employees
          </button>
        </Show>
      </section>

      <Show when={cycleId()}>
        <section class="rounded-xl border border-stroke bg-surface p-4 shadow-sm">
          <h2 class="mb-3 text-lg font-medium">Reviews</h2>
          <For each={reviews.data ?? []} fallback={<p class="text-sm text-text-secondary">No reviews — assign first.</p>}>
            {(r) => (
              <div class="mb-4 border-b border-slate-100 pb-3 text-sm">
                <p class="font-medium">{r.employee_no} — {r.employee_name} · {r.status}</p>
                <p class="text-text-secondary">Self: {r.self_comments || "—"}</p>
                <p class="text-text-secondary">Manager: {r.manager_comments || "—"} · score {r.overall_score ?? "—"}</p>
                <div class="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="rounded border border-stroke px-2 py-1 text-xs"
                    onClick={() => {
                      setEditId(r.id);
                      setScores(Object.fromEntries(SCORE_FIELDS.map(([key]) => [key, String(r.scores_json?.[key] ?? "")])));
                      setComments(r.manager_comments || "");
                    }}
                  >
                    Edit manager review
                  </button>
                  <button
                    type="button"
                    class="rounded border border-stroke px-2 py-1 text-xs"
                    onClick={() => void apiFetch(`/api/v1/hr/performance/reviews/${r.id}/store-201`, { method: "POST", body: "{}" }).then((res) => {
                      if (!res.success) toast.warning(res.message ?? "Failed.");
                      else toast.success("Stored in 201.");
                    })}
                  >
                    Store 201
                  </button>
                  <button
                    type="button"
                    class="rounded border border-stroke px-2 py-1 text-xs"
                    onClick={() => {
                      setAckId(r.id);
                      setSignedName(r.employee_name ?? "");
                      setSigUrl(null);
                    }}
                  >
                    Acknowledge
                  </button>
                </div>
                <Show when={editId() === r.id}>
                  <div class="mt-2 grid gap-2 sm:grid-cols-2">
                    <For each={SCORE_FIELDS}>
                      {([key, label]) => (
                        <Field label={label}>
                          <input class={inputClass} type="number" min="1" max="5" value={scores()[key] ?? ""} onInput={(e) => setScores({ ...scores(), [key]: e.currentTarget.value })} />
                        </Field>
                      )}
                    </For>
                    <Field label="Comments"><input class={inputClass} value={comments()} onInput={(e) => setComments(e.currentTarget.value)} /></Field>
                    <button type="button" class="rounded bg-brand-600 px-3 py-1.5 text-xs text-white" onClick={() => void saveManager()}>Save</button>
                  </div>
                </Show>
              </div>
            )}
          </For>
        </section>
      </Show>

      <ClientEvaluations emp={clientEmp} setEmp={setClientEmp} scores={clientScores} setScores={setClientScores} notes={clientNotes} setNotes={setClientNotes} />

      <Modal open={ackId() != null} onClose={() => setAckId(null)} title="Acknowledge with signature">
        <div class="space-y-3">
          <Field label="Full name (typed)">
            <input class={inputClass} value={signedName()} onInput={(e) => setSignedName(e.currentTarget.value)} />
          </Field>
          <div>
            <p class="mb-1 text-xs font-medium text-text-secondary">Draw signature</p>
            <SignaturePad onChange={(url) => setSigUrl(url)} />
          </div>
          <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white" onClick={() => void submitAck()}>
            Confirm acknowledgment
          </button>
        </div>
      </Modal>
    </HrLayout>
  );
}

function ClientEvaluations(props: {
  emp: () => string;
  setEmp: (v: string) => void;
  scores: () => Record<string, string>;
  setScores: (v: Record<string, string>) => void;
  notes: () => string;
  setNotes: (v: string) => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const reviews = createQuery(() => ({
    queryKey: ["hr-client-reviews"],
    queryFn: async () => (await apiFetch<Review[]>("/api/v1/hr/performance/reviews?source=client")).data ?? [],
  }));
  const save = async () => {
    const scores = Object.fromEntries(SCORE_FIELDS.map(([key]) => [key, Number(props.scores()[key])]));
    const res = await apiFetch("/api/v1/hr/performance/reviews/client", {
      method: "POST",
      body: JSON.stringify({ employee_id: Number(props.emp()), scores, notes: props.notes() }),
    });
    if (!res.success) return toast.warning(res.message ?? "Could not save the client evaluation.");
    toast.success("Client evaluation saved.");
    void qc.invalidateQueries({ queryKey: ["hr-client-reviews"] });
  };
  return (
    <section class="mt-4 rounded-xl border border-stroke bg-surface p-4 shadow-sm">
      <h2 class="mb-3 text-lg font-medium">Client evaluations</h2>
      <div class="grid gap-2 sm:grid-cols-2">
        <Field label="Employee id"><input class={inputClass} value={props.emp()} onInput={(e) => props.setEmp(e.currentTarget.value)} /></Field>
        <For each={SCORE_FIELDS}>
          {([key, label]) => (
            <Field label={label}>
              <input class={inputClass} type="number" min="1" max="5" value={props.scores()[key] ?? ""} onInput={(e) => props.setScores({ ...props.scores(), [key]: e.currentTarget.value })} />
            </Field>
          )}
        </For>
        <Field label="Notes"><input class={inputClass} value={props.notes()} onInput={(e) => props.setNotes(e.currentTarget.value)} /></Field>
      </div>
      <button type="button" class="mt-2 rounded bg-brand-600 px-3 py-1.5 text-sm text-white" onClick={() => void save()}>Save client evaluation</button>
      <For each={reviews.data ?? []}>
        {(r) => <p class="mt-2 text-sm">{r.employee_name} · {r.overall_score ?? "—"} · {r.manager_comments || "No notes"}</p>}
      </For>
    </section>
  );
}
