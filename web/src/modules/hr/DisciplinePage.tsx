import { createSignal, For, Show } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiBase, apiFetch, getAccessToken } from "../../shared/api";
import { getActiveBranchIdCurrent, getActiveTenantId } from "../../shared/activeContext";
import { useEmployees } from "../../shared/useHr";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";

type CaseRow = {
  id: number; case_no: string; case_type: string; status: string; subject: string;
  employee_no?: string; employee_name?: string; employee_id: number;
  has_real_file?: boolean;
};
type CaseFile = { id: number; document_id: number; title: string; file_name: string };

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const tenantId = getActiveTenantId();
  if (tenantId) headers["X-Tenant-ID"] = String(tenantId);
  const branchId = getActiveBranchIdCurrent();
  if (branchId) headers["X-Branch-ID"] = String(branchId);
  return headers;
}

async function postFile(path: string, fields: Record<string, string>, file: File) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.append(key, value);
  fd.append("file", file);
  const res = await fetch(`${apiBase}${path}`, { method: "POST", headers: await authHeaders(), body: fd });
  const body = (await res.json()) as { success?: boolean; message?: string };
  return { ok: res.ok && !!body.success, message: body.message };
}

export default function DisciplinePage() {
  const toast = useToast();
  const qc = useQueryClient();
  const emps = useEmployees(() => ({ page: 1, pageSize: 200, status: "active" }));
  const [empId, setEmpId] = createSignal("");
  const [caseType, setCaseType] = createSignal("nte");
  const [subject, setSubject] = createSignal("");
  const [details, setDetails] = createSignal("");
  const [file, setFile] = createSignal<File | null>(null);
  let fileInput: HTMLInputElement | undefined;
  const [selectedId, setSelectedId] = createSignal<number | null>(null);

  const cases = createQuery(() => ({
    queryKey: ["hr-discipline-cases"],
    queryFn: async () => (await apiFetch<CaseRow[]>("/api/v1/hr/discipline/cases")).data ?? [],
  }));
  const detail = createQuery(() => ({
    queryKey: ["hr-discipline-case", selectedId()],
    enabled: !!selectedId(),
    queryFn: async () => {
      const res = await apiFetch<{ case: CaseRow; events: { event_type: string; notes: string; created_at: string }[]; files: CaseFile[] }>(
        `/api/v1/hr/discipline/cases/${selectedId()}`,
      );
      return res.data!;
    },
  }));

  const create = async () => {
    const chosen = file();
    if (!empId() || !subject().trim()) return toast.warning("Employee and subject required.");
    if (!chosen) return toast.warning("Choose a file before creating the case.");
    const posted = await postFile("/api/v1/hr/discipline/cases", {
      employee_id: empId(),
      case_type: caseType(),
      subject: subject().trim(),
      details: details().trim(),
    }, chosen);
    if (!posted.ok) return toast.warning(posted.message ?? "Create failed.");
    toast.success("Case created.");
    setSubject(""); setDetails(""); setFile(null);
    if (fileInput) fileInput.value = "";
    void qc.invalidateQueries({ queryKey: ["hr-discipline-cases"] });
  };

  const addFile = async (chosen: File) => {
    const id = selectedId();
    if (!id) return;
    const posted = await postFile(`/api/v1/hr/discipline/cases/${id}/files`, {}, chosen);
    if (!posted.ok) return toast.warning(posted.message ?? "Upload failed.");
    toast.success("File stored on the case.");
    void qc.invalidateQueries({ queryKey: ["hr-discipline-case", id] });
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
          <Field label="File">
            <input ref={fileInput} class={inputClass} type="file" onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)} />
          </Field>
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
                <Show when={!d().case.has_real_file}>
                  <p class="text-amber-800">Attach a stored file before Under review, Decide, or Close. A generated letter does not count.</p>
                </Show>
                <div class="flex flex-wrap gap-2">
                  <button type="button" class="rounded border border-stroke px-2 py-1 text-xs" onClick={() => void advance("under_review")}>Under review</button>
                  <button type="button" class="rounded border border-stroke px-2 py-1 text-xs" onClick={() => void advance("decide")}>Decide</button>
                  <button type="button" class="rounded border border-stroke px-2 py-1 text-xs" onClick={() => void advance("close")}>Close</button>
                  <button type="button" class="rounded bg-brand-600 px-2 py-1 text-xs text-white" onClick={() => void renderLetter()}>Letter → 201</button>
                </div>
                <div>
                  <p class="mb-1 font-medium">Files</p>
                  <For each={d().files ?? []} fallback={<p class="text-text-secondary">No stored file yet.</p>}>
                    {(f) => <p>{f.file_name || f.title}</p>}
                  </For>
                  <input
                    class={`${inputClass} mt-2`}
                    type="file"
                    onChange={(e) => {
                      const chosen = e.currentTarget.files?.[0];
                      e.currentTarget.value = "";
                      if (chosen) void addFile(chosen);
                    }}
                  />
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
