import { createSignal, For, Show } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { useEmployees } from "../../shared/useHr";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";

type CaseRow = {
  id: number; case_no: string; case_type: string; status: string; subject: string;
  employee_no?: string; employee_name?: string; employee_id: number;
};

export default function DisciplinePage() {
  const toast = useToast();
  const qc = useQueryClient();
  const emps = useEmployees(() => ({ page: 1, pageSize: 200, status: "active" }));
  const [empId, setEmpId] = createSignal("");
  const [caseType, setCaseType] = createSignal("nte");
  const [subject, setSubject] = createSignal("");
  const [details, setDetails] = createSignal("");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);

  const cases = createQuery(() => ({
    queryKey: ["hr-discipline-cases"],
    queryFn: async () => (await apiFetch<CaseRow[]>("/api/v1/hr/discipline/cases")).data ?? [],
  }));
  const detail = createQuery(() => ({
    queryKey: ["hr-discipline-case", selectedId()],
    enabled: !!selectedId(),
    queryFn: async () => {
      const res = await apiFetch<{ case: CaseRow; events: { event_type: string; notes: string; created_at: string }[] }>(
        `/api/v1/hr/discipline/cases/${selectedId()}`,
      );
      return res.data!;
    },
  }));

  const create = async () => {
    if (!empId() || !subject().trim()) return toast.warning("Employee and subject required.");
    const res = await apiFetch("/api/v1/hr/discipline/cases", {
      method: "POST",
      body: JSON.stringify({
        employee_id: Number(empId()), case_type: caseType(),
        subject: subject().trim(), details: details().trim(),
      }),
    });
    if (!res.success) return toast.warning(res.message ?? "Create failed.");
    toast.success("Case created.");
    setSubject(""); setDetails("");
    void qc.invalidateQueries({ queryKey: ["hr-discipline-cases"] });
  };

  const advance = async (action: string) => {
    const id = selectedId();
    if (!id) return;
    const res = await apiFetch(`/api/v1/hr/discipline/cases/${id}/advance`, {
      method: "POST", body: JSON.stringify({ action, notes: "" }),
    });
    if (!res.success) return toast.warning(res.message ?? "Failed.");
    void qc.invalidateQueries({ queryKey: ["hr-discipline-case", id] });
    void qc.invalidateQueries({ queryKey: ["hr-discipline-cases"] });
  };

  const renderLetter = async () => {
    const id = selectedId();
    if (!id) return;
    const res = await apiFetch(`/api/v1/hr/discipline/cases/${id}/render-letter`, { method: "POST", body: "{}" });
    if (!res.success) return toast.warning(res.message ?? "Failed.");
    toast.success("Letter stored in 201 file.");
    void qc.invalidateQueries({ queryKey: ["hr-discipline-case", id] });
  };

  return (
    <HrLayout>
      <h1 class="mb-1 text-2xl font-semibold">Discipline / NTE</h1>
      <p class="mb-6 text-sm text-text-secondary">
        Case timeline and letter → 201. Have PH labor counsel review wording before claiming DOLE compliance.
      </p>

      <section class="mb-6 rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h2 class="mb-3 text-lg font-medium">Open case</h2>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Employee">
            <select class={inputClass} value={empId()} onChange={(e) => setEmpId(e.currentTarget.value)}>
              <option value="">Select…</option>
              <For each={emps.data?.rows ?? []}>{(e) => <option value={e.id}>{e.employee_no} — {e.full_name}</option>}</For>
            </select>
          </Field>
          <Field label="Type">
            <select class={inputClass} value={caseType()} onChange={(e) => setCaseType(e.currentTarget.value)}>
              <option value="coaching">Coaching</option>
              <option value="nte">NTE</option>
              <option value="written_warning">Written warning</option>
              <option value="final_warning">Final warning</option>
              <option value="suspension">Suspension</option>
              <option value="termination">Termination</option>
            </select>
          </Field>
          <Field label="Subject"><input class={inputClass} value={subject()} onInput={(e) => setSubject(e.currentTarget.value)} /></Field>
          <Field label="Details"><textarea class={inputClass} rows={2} value={details()} onInput={(e) => setDetails(e.currentTarget.value)} /></Field>
        </div>
        <button type="button" class="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm text-white" onClick={() => void create()}>Create</button>
      </section>

      <div class="grid gap-6 lg:grid-cols-2">
        <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
          <h2 class="mb-3 text-lg font-medium">Cases</h2>
          <For each={cases.data ?? []} fallback={<p class="text-sm text-text-secondary">No cases.</p>}>
            {(c) => (
              <button
                type="button"
                class="mb-1 block w-full rounded border border-transparent px-2 py-2 text-left text-sm hover:bg-slate-50"
                classList={{ "border-brand-500 bg-brand-50": selectedId() === c.id }}
                onClick={() => setSelectedId(c.id)}
              >
                <span class="font-medium">{c.case_no}</span> · {c.employee_name} · {c.case_type} · {c.status}
              </button>
            )}
          </For>
        </section>
        <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
          <h2 class="mb-3 text-lg font-medium">Detail</h2>
          <Show when={detail.data} fallback={<p class="text-sm text-text-secondary">Select a case.</p>}>
            {(d) => (
              <div class="space-y-3 text-sm">
                <p class="font-medium">{d().case.case_no} — {d().case.subject}</p>
                <div class="flex flex-wrap gap-2">
                  <button type="button" class="rounded border border-stroke px-2 py-1 text-xs" onClick={() => void advance("under_review")}>Under review</button>
                  <button type="button" class="rounded border border-stroke px-2 py-1 text-xs" onClick={() => void advance("decide")}>Decide</button>
                  <button type="button" class="rounded border border-stroke px-2 py-1 text-xs" onClick={() => void advance("close")}>Close</button>
                  <button type="button" class="rounded bg-brand-600 px-2 py-1 text-xs text-white" onClick={() => void renderLetter()}>Letter → 201</button>
                </div>
                <ul class="space-y-1 border-t border-stroke pt-2">
                  <For each={d().events}>{(ev) => <li><span class="font-medium">{ev.event_type}</span> · {ev.notes}</li>}</For>
                </ul>
              </div>
            )}
          </Show>
        </section>
      </div>
    </HrLayout>
  );
}
