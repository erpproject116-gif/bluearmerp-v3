import { useParams } from "@solidjs/router";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiBase, apiFetch, getAccessToken } from "../../shared/api";
import { getActiveBranchIdCurrent, getActiveTenantId } from "../../shared/activeContext";
import { fetchEmployeeOptions } from "../../shared/useHr";
import { LookupCombo } from "../../shared/LookupCombo";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { HrCasesTabs } from "./HrCasesTabs";
import { HrLayout } from "./HrLayout";
import { HrBadge, HrEmpty, HrNotice, HrPageHead, HrSteps, HrTcard, HrWizardNav, type HrBadgeTone } from "./HrUi";

const CASE_STEPS = [
  "1. Incident",
  "2. Notice to Explain",
  "3. Explanation",
  "4. Hearing",
  "5. Decision",
  "6. Sanction & 201 filing",
];

const CASE_TYPES: { value: string; label: string }[] = [
  { value: "coaching", label: "Coaching" },
  { value: "nte", label: "Notice to explain" },
  { value: "written_warning", label: "Written warning" },
  { value: "final_warning", label: "Final warning" },
  { value: "suspension", label: "Suspension" },
  { value: "termination", label: "Termination" },
];

type CaseRow = {
  id: number;
  case_no: string;
  case_type: string;
  status: string;
  subject: string;
  employee_no?: string;
  employee_name?: string;
  employee_id: number;
  has_real_file?: boolean;
  penalty_amount?: number | null;
  authority_to_deduct?: boolean;
  created_at?: string;
};
type PayItemType = { id: number; item_code: string; item_name: string; item_kind: string };
type CaseFile = { id: number; document_id: number; title: string; file_name: string };
type Violation = { id: number; employee_name: string; description: string; status: string; created_at?: string };

function typeLabel(value: string) {
  return CASE_TYPES.find((t) => t.value === value)?.label ?? value.replace(/_/g, " ");
}

function typeTone(value: string): HrBadgeTone {
  switch (value) {
    case "termination":
      return "danger";
    case "suspension":
    case "final_warning":
      return "warning";
    case "written_warning":
      return "warning";
    case "nte":
      return "info";
    default:
      return "neutral";
  }
}

function statusTone(status: string): HrBadgeTone {
  return status === "closed" ? "neutral" : "warning";
}

function statusLabel(status: string) {
  if (!status) return "—";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatOpened(iso?: string) {
  if (!iso) return "—";
  const d = iso.slice(0, 10);
  return d || iso;
}

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
  const [empId, setEmpId] = createSignal<number | null>(null);
  const [empLabel, setEmpLabel] = createSignal("");
  const [caseType, setCaseType] = createSignal("nte");
  const [subject, setSubject] = createSignal("");
  const [details, setDetails] = createSignal("");
  const [penalty, setPenalty] = createSignal("");
  const [authority, setAuthority] = createSignal(false);
  const [payItemTypeId, setPayItemTypeId] = createSignal("");
  const [file, setFile] = createSignal<File | null>(null);
  let fileInput: HTMLInputElement | undefined;
  const params = useParams<{ id?: string }>();
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  createEffect(() => {
    const raw = params.id;
    if (!raw) return;
    const n = Number(raw);
    if (Number.isInteger(n) && n > 0) setSelectedId(n);
  });
  const [createOpen, setCreateOpen] = createSignal(false);
  const [caseStep, setCaseStep] = createSignal(0);
  const [search, setSearch] = createSignal("");
  const [typeFilter, setTypeFilter] = createSignal("");
  const [statusSeg, setStatusSeg] = createSignal<"" | "open" | "closed">("");
  const [busy, setBusy] = createSignal(false);

  const payItems = createQuery(() => ({
    queryKey: ["hr-pay-item-types", "deduction"],
    queryFn: async () => (await apiFetch<PayItemType[]>("/api/v1/hr/pay-item-types?kind=deduction&page=1&pageSize=200")).data ?? [],
  }));

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

  const filtered = createMemo(() => {
    const q = search().trim().toLowerCase();
    return (cases.data ?? []).filter((row) => {
      if (typeFilter() && row.case_type !== typeFilter()) return false;
      if (statusSeg() === "open" && row.status === "closed") return false;
      if (statusSeg() === "closed" && row.status !== "closed") return false;
      if (!q) return true;
      return (
        row.case_no.toLowerCase().includes(q) ||
        (row.employee_name || "").toLowerCase().includes(q) ||
        (row.employee_no || "").toLowerCase().includes(q) ||
        typeLabel(row.case_type).toLowerCase().includes(q)
      );
    });
  });

  const create = async () => {
    const chosen = file();
    if (!empId() || !subject().trim()) return toast.warning("Employee and subject required.");
    if (!chosen) return toast.warning("Choose a file before creating the case.");
    setBusy(true);
    const posted = await postFile(
      "/api/v1/hr/discipline/cases",
      {
        employee_id: String(empId() ?? ""),
        case_type: caseType(),
        subject: subject().trim(),
        details: details().trim(),
        penalty_amount: penalty().trim(),
        authority_to_deduct: authority() ? "true" : "false",
      },
      chosen,
    );
    setBusy(false);
    if (!posted.ok) return toast.warning(posted.message ?? "Create failed.");
    toast.success("Case created.");
    setSubject("");
    setDetails("");
    setFile(null);
    setCreateOpen(false);
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
      method: "POST",
      body: JSON.stringify({ action, notes: "" }),
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
      <HrCasesTabs />
      <HrPageHead
        title={
          <>
            Discipline <span class="text-sm font-medium text-text-secondary">(Notice to Explain)</span>
          </>
        }
        subtitle="Case timeline and letters, filed to the employee's 201 file (personnel file)."
        actions={
          <div class="hr-actions">
            <Show when={selectedId()}>
              <button type="button" class="hr-btn" onClick={() => setSelectedId(null)}>
                Back to list
              </button>
            </Show>
            <button type="button" class="hr-btn hr-btn-primary" onClick={() => setCreateOpen(true)}>
              + New case
            </button>
          </div>
        }
      />

      <Show when={!selectedId()}>
        <HrTcard
          toolbar={
            <>
              <input
                class="grow rounded-lg border border-stroke bg-surface px-3 py-2 text-sm"
                placeholder="Search case no. or employee…"
                aria-label="Search"
                value={search()}
                onInput={(e) => setSearch(e.currentTarget.value)}
              />
              <select
                class="rounded-lg border border-stroke bg-surface px-2 text-sm"
                aria-label="Type"
                value={typeFilter()}
                onChange={(e) => setTypeFilter(e.currentTarget.value)}
              >
                <option value="">Type: All</option>
                <For each={CASE_TYPES}>{(t) => <option value={t.value}>{t.label}</option>}</For>
              </select>
              <div class="hr-seg" role="group" aria-label="Status">
                <button type="button" classList={{ on: statusSeg() === "" }} onClick={() => setStatusSeg("")}>
                  All
                </button>
                <button type="button" classList={{ on: statusSeg() === "open" }} onClick={() => setStatusSeg("open")}>
                  Open
                </button>
                <button type="button" classList={{ on: statusSeg() === "closed" }} onClick={() => setStatusSeg("closed")}>
                  Closed
                </button>
              </div>
            </>
          }
        >
          <div class="hr-tbl-wrap">
            <table class="hr-tbl">
              <thead>
                <tr>
                  <th>Case no.</th>
                  <th>Employee</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Opened</th>
                </tr>
              </thead>
              <tbody>
                <For
                  each={filtered()}
                  fallback={
                    <tr>
                      <td colspan="5">
                        <HrEmpty title="No matches" hint="Try a different search or clear the filters." />
                      </td>
                    </tr>
                  }
                >
                  {(c) => (
                    <tr>
                      <td>
                        <button
                          type="button"
                          class="font-mono text-sm text-brand-700 underline-offset-2 hover:underline"
                          onClick={() => {
                            setSelectedId(c.id);
                            setCaseStep(0);
                          }}
                        >
                          {c.case_no}
                        </button>
                      </td>
                      <td>{c.employee_name}</td>
                      <td>
                        <HrBadge tone={typeTone(c.case_type)}>{typeLabel(c.case_type)}</HrBadge>
                      </td>
                      <td>
                        <HrBadge tone={statusTone(c.status)}>{statusLabel(c.status)}</HrBadge>
                      </td>
                      <td>{formatOpened(c.created_at)}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </HrTcard>

        <ClientViolations />
      </Show>

      <Show when={selectedId()}>
        <HrTcard>
          <div class="p-4">
            <Show when={detail.data} fallback={<HrEmpty title="Loading case…" />}>
              {(d) => (
                <div class="space-y-3 text-sm">
                  <div class="flex flex-wrap items-center gap-2">
                    <h2 class="text-base font-semibold">
                      <span class="font-mono">{d().case.case_no}</span> · {d().case.employee_name}
                    </h2>
                    <HrBadge tone={typeTone(d().case.case_type)}>{typeLabel(d().case.case_type)}</HrBadge>
                    <HrBadge tone={statusTone(d().case.status)}>{statusLabel(d().case.status)}</HrBadge>
                  </div>
                  <p class="text-text-secondary">{d().case.subject}</p>
                  <HrNotice>
                    Letters are drafts for review. Consult labor counsel before serious action (DOLE due process: two-notice rule).
                  </HrNotice>
                  <HrSteps steps={CASE_STEPS} current={caseStep()} onSelect={setCaseStep} />

                  <Show when={caseStep() === 0}>
                    <p class="text-text-secondary">Type: {typeLabel(d().case.case_type)}</p>
                    <p class="text-text-secondary">
                      Penalty {d().case.penalty_amount ?? 0}
                      {d().case.authority_to_deduct ? " · authority to deduct recorded" : ""}. Pay is unchanged until a deduction pay item
                      includes it.
                    </p>
                  </Show>

                  <Show when={caseStep() === 1}>
                    <div class="rounded-lg border border-stroke bg-panel p-3">
                      <p class="font-semibold">NOTICE TO EXPLAIN</p>
                      <p class="mt-1 text-xs text-text-secondary">Generate the letter and store it in the 201 file with the button below.</p>
                    </div>
                    <button type="button" class="hr-btn hr-btn-primary hr-btn-sm" onClick={() => void renderLetter()}>
                      Letter → 201
                    </button>
                  </Show>

                  <Show when={caseStep() === 2}>
                    <p class="text-text-secondary">Advance to under review when the explanation period is handled.</p>
                    <button type="button" class="hr-btn hr-btn-sm" onClick={() => void advance("under_review")}>
                      Under review
                    </button>
                    <div>
                      <p class="mb-1 font-medium">Attach explanation / files</p>
                      <input
                        class={inputClass}
                        type="file"
                        onChange={(e) => {
                          const chosen = e.currentTarget.files?.[0];
                          e.currentTarget.value = "";
                          if (chosen) void addFile(chosen);
                        }}
                      />
                    </div>
                  </Show>

                  <Show when={caseStep() === 3}>
                    <HrNotice>
                      Hearing date, attendees, and minutes are not on the API yet. Use events below for notes until those fields exist.
                    </HrNotice>
                    <label class="block text-sm font-medium">
                      Hearing date
                    </label>
                    <input type="datetime-local" class={inputClass} disabled />
                    <label class="block text-sm font-medium">
                      Attendees
                    </label>
                    <input class={inputClass} disabled />
                    <label class="block text-sm font-medium">
                      Minutes
                    </label>
                    <textarea class={inputClass} rows={3} disabled />
                  </Show>

                  <Show when={caseStep() === 4}>
                    <div class="flex flex-wrap gap-2">
                      <button type="button" class="hr-btn hr-btn-sm" onClick={() => void advance("decide")}>
                        Decide
                      </button>
                    </div>
                  </Show>

                  <Show when={caseStep() === 5}>
                    <Show when={d().case.authority_to_deduct && (d().case.penalty_amount ?? 0) > 0}>
                      <div class="flex flex-wrap items-end gap-2">
                        <select class={inputClass + " w-56"} value={payItemTypeId()} onChange={(e) => setPayItemTypeId(e.currentTarget.value)}>
                          <option value="">Deduction pay item…</option>
                          <For each={(payItems.data ?? []).filter((t) => t.item_kind === "deduction")}>
                            {(t) => (
                              <option value={t.id}>
                                {t.item_code} — {t.item_name}
                              </option>
                            )}
                          </For>
                        </select>
                        <button
                          type="button"
                          class="hr-btn hr-btn-sm"
                          onClick={() => {
                            const id = selectedId();
                            if (!id || !payItemTypeId()) return toast.warning("Choose a deduction pay item.");
                            void apiFetch(`/api/v1/hr/discipline/cases/${id}/include-pay-item`, {
                              method: "POST",
                              body: JSON.stringify({ pay_item_type_id: Number(payItemTypeId()) }),
                            }).then((res) => {
                              if (!res.success) toast.warning(res.message ?? "Pay item was not added.");
                              else toast.success(res.message ?? "Pay item added.");
                            });
                          }}
                        >
                          Include in pay
                        </button>
                      </div>
                    </Show>
                    <div class="flex flex-wrap gap-2">
                      <button type="button" class="hr-btn hr-btn-sm" onClick={() => void advance("close")}>
                        Close
                      </button>
                      <button type="button" class="hr-btn hr-btn-primary hr-btn-sm" onClick={() => void renderLetter()}>
                        Issue decision &amp; file to 201
                      </button>
                    </div>
                  </Show>

                  <Show when={!d().case.has_real_file}>
                    <p class="text-amber-800">Attach a stored file before Under review, Decide, or Close. A generated letter does not count.</p>
                  </Show>
                  <div>
                    <p class="mb-1 font-medium">Files</p>
                    <For each={d().files ?? []} fallback={<p class="text-text-secondary">No stored file yet.</p>}>
                      {(f) => <p>{f.file_name || f.title}</p>}
                    </For>
                  </div>
                  <ul class="hr-aq">
                    <For each={d().events} fallback={<li><div class="hr-wempty" style={{ width: "100%" }}>No events yet.</div></li>}>
                      {(ev) => (
                        <li>
                          <span class="t">
                            <b>{ev.event_type}</b>
                            <span class="xs">
                              {ev.notes} · {formatOpened(ev.created_at)}
                            </span>
                          </span>
                        </li>
                      )}
                    </For>
                  </ul>
                  <HrWizardNav
                    canBack={caseStep() > 0}
                    canNext={caseStep() < CASE_STEPS.length - 1}
                    onBack={() => setCaseStep(Math.max(0, caseStep() - 1))}
                    onNext={() => setCaseStep(Math.min(CASE_STEPS.length - 1, caseStep() + 1))}
                  />
                </div>
              )}
            </Show>
          </div>
        </HrTcard>
      </Show>

      <Show when={createOpen()}>
        <div
          class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="New discipline case"
        >
          <div class="max-h-[90vh] w-full max-w-lg overflow-auto rounded-lg border border-stroke bg-surface p-4 shadow-lg">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold">New discipline case</h2>
              <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setCreateOpen(false)}>
                ✕
              </button>
            </div>
            <div class="grid gap-3">
              <LookupCombo
                label="Employee"
                value={empLabel}
                selectedId={empId}
                onInput={setEmpLabel}
                onSelect={(o) => {
                  setEmpId(o.id);
                  setEmpLabel(o.label);
                }}
                onClear={() => {
                  setEmpId(null);
                  setEmpLabel("");
                }}
                fetchOptions={(q) => fetchEmployeeOptions(q, "active")}
                placeholder="Search employees…"
              />
              <Field label="Type">
                <select class={inputClass} value={caseType()} onChange={(e) => setCaseType(e.currentTarget.value)}>
                  <For each={CASE_TYPES}>{(t) => <option value={t.value}>{t.label}</option>}</For>
                </select>
              </Field>
              <Field label="Subject">
                <input class={inputClass} value={subject()} onInput={(e) => setSubject(e.currentTarget.value)} />
              </Field>
              <Field label="Description">
                <textarea class={inputClass} rows={3} value={details()} onInput={(e) => setDetails(e.currentTarget.value)} />
              </Field>
              <Field label="Penalty amount">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  class={inputClass}
                  value={penalty()}
                  placeholder="Optional"
                  onInput={(e) => setPenalty(e.currentTarget.value)}
                />
              </Field>
              <label class="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={authority()} onChange={(e) => setAuthority(e.currentTarget.checked)} />
                Authority to deduct (record only — pay changes when a pay item includes it)
              </label>
              <Field label="File (required)">
                <input ref={fileInput} class={inputClass} type="file" onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)} />
              </Field>
            </div>
            <div class="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" class="hr-btn" onClick={() => setCreateOpen(false)}>
                Cancel
              </button>
              <button type="button" class="hr-btn hr-btn-primary" disabled={busy()} onClick={() => void create()}>
                Save
              </button>
            </div>
          </div>
        </div>
      </Show>
    </HrLayout>
  );
}

function ClientViolations() {
  const toast = useToast();
  const [empId, setEmpId] = createSignal<number | null>(null);
  const [empLabel, setEmpLabel] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [recordOpen, setRecordOpen] = createSignal(false);
  const reports = createQuery(() => ({
    queryKey: ["hr-client-violations"],
    queryFn: async () => (await apiFetch<Violation[]>("/api/v1/hr/client-violations")).data ?? [],
  }));
  const waiting = createMemo(() => (reports.data ?? []).filter((r) => r.status === "waiting" || r.status !== "closed"));

  const save = async () => {
    if (!empId()) return toast.warning("Choose an employee.");
    if (!description().trim()) return toast.warning("Description is required.");
    const res = await apiFetch("/api/v1/hr/client-violations", {
      method: "POST",
      body: JSON.stringify({ employee_id: empId(), description: description() }),
    });
    if (!res.success) return toast.warning(res.message ?? "Could not save the report.");
    toast.success("Violation report is waiting.");
    setDescription("");
    setEmpId(null);
    setEmpLabel("");
    setRecordOpen(false);
    void reports.refetch();
  };

  return (
    <section class="hr-w s12 mt-4" aria-label="Waiting client violation reports">
      <header>
        <h3>Waiting client violation reports</h3>
        <span class="grow" />
        <button type="button" class="hr-btn hr-btn-sm" onClick={() => setRecordOpen(true)}>
          + Record report
        </button>
      </header>
      <div class="hr-tbl-wrap">
        <table class="hr-tbl">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Client report</th>
              <th>Received</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <For
              each={waiting()}
              fallback={
                <tr>
                  <td colspan="4">
                    <div class="hr-wempty">No waiting client reports.</div>
                  </td>
                </tr>
              }
            >
              {(row) => (
                <tr>
                  <td>{row.employee_name}</td>
                  <td>{row.description}</td>
                  <td>{formatOpened(row.created_at)}</td>
                  <td>
                    <HrBadge tone="warning">{statusLabel(row.status)}</HrBadge>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>

      <Show when={recordOpen()}>
        <div
          class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Record client violation"
        >
          <div class="w-full max-w-md rounded-lg border border-stroke bg-surface p-4 shadow-lg">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold">Record client violation</h2>
              <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setRecordOpen(false)}>
                ✕
              </button>
            </div>
            <LookupCombo
              label="Employee"
              value={empLabel}
              selectedId={empId}
              onInput={setEmpLabel}
              onSelect={(o) => {
                setEmpId(o.id);
                setEmpLabel(o.label);
              }}
              onClear={() => {
                setEmpId(null);
                setEmpLabel("");
              }}
              fetchOptions={(q) => fetchEmployeeOptions(q)}
              placeholder="Search employees…"
            />
            <Field label="Description">
              <textarea class={inputClass} rows={3} value={description()} onInput={(e) => setDescription(e.currentTarget.value)} />
            </Field>
            <div class="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" class="hr-btn" onClick={() => setRecordOpen(false)}>
                Cancel
              </button>
              <button type="button" class="hr-btn hr-btn-primary" onClick={() => void save()}>
                Record report
              </button>
            </div>
          </div>
        </div>
      </Show>
    </section>
  );
}
