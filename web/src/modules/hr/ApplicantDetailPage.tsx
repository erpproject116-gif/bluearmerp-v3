import { A, useParams } from "@solidjs/router";
import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { apiBase, apiFetch, getAccessToken } from "../../shared/api";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";
import { HrBadge, HrEmpty, HrNotice, HrPageHead, HrPlanned, HrSteps, HrTcard, HrWizardNav } from "./HrUi";

type Child = { child_name: string; birth_date?: string | null };
type Job = { company_name: string; position: string; started_on?: string | null; ended_on?: string | null };
type Reference = { ref_name: string; position: string; company_name: string; contact_no: string };
type AppFile = { id: number; kind: string; file_name: string; mime_type: string };
type Comment = { body: string; file_name: string; created_at: string };
type ApplicationDetail = {
  id: number;
  full_name: string;
  status: string;
  position_desired: string;
  email: string;
  cellphone: string;
  has_signature: boolean;
  children: Child[];
  jobs: Job[];
  references: Reference[];
  files: AppFile[];
};

const FLOW = [
  { key: "pooling", label: "1. Applicant" },
  { key: "initial_interview", label: "2. Interview" },
  { key: "exam", label: "3. Exam encoding" },
  { key: "final_interview", label: "4. Final interview" },
  { key: "hired", label: "5. Hire" },
  { key: "onboarding", label: "6. Onboarding checklist" },
  { key: "create_employee", label: "7. Create employee", planned: true },
] as const;

const STATUSES = [
  ["pooling", "Pooling"],
  ["initial_interview", "Initial interview"],
  ["exam", "Exam"],
  ["final_interview", "Final interview"],
  ["onboarding", "Onboarding"],
  ["hired", "Hired"],
  ["rejected", "Rejected"],
  ["terminated", "Terminated"],
  ["resigned", "Resigned"],
] as const;

function statusToStep(status: string): number {
  const i = FLOW.findIndex((s) => !("planned" in s && s.planned) && s.key === status);
  if (i >= 0) return i;
  if (status === "rejected" || status === "terminated" || status === "resigned") return 0;
  return 0;
}

export default function ApplicantDetailPage() {
  const params = useParams<{ id: string }>();
  const toast = useToast();
  const [status, setStatus] = createSignal("");
  const [step, setStep] = createSignal(0);
  const [detail, { refetch }] = createResource(
    () => params.id,
    async (id) => {
      const res = await apiFetch<ApplicationDetail>(`/api/v1/hr/applications/${id}`);
      if (!res.success || !res.data) return null;
      setStatus(res.data.status);
      setStep(statusToStep(res.data.status));
      return res.data;
    },
  );
  const [comments] = createResource(
    () => params.id,
    async (id) => (await apiFetch<Comment[]>(`/api/v1/hr/applications/${id}/comments`)).data ?? [],
  );

  const saveStatus = async (next?: string) => {
    const value = next ?? status();
    const res = await apiFetch(`/api/v1/hr/applications/${params.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: value }),
    });
    if (!res.success) {
      toast.warning(res.message ?? "Could not update the status.");
      return false;
    }
    setStatus(value);
    toast.success("Status saved.");
    void refetch();
    return true;
  };

  const download = async (file: AppFile) => {
    const token = await getAccessToken();
    const res = await fetch(`${apiBase}/api/v1/hr/applications/${params.id}/files/${file.id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      toast.warning("Could not download the file.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.file_name || "file";
    link.click();
    URL.revokeObjectURL(url);
  };

  const goNext = async () => {
    const cur = FLOW[step()];
    if (!cur) return;
    if ("planned" in cur && cur.planned) return;
    if (step() === 0) {
      setStep(1);
      return;
    }
    const ok = await saveStatus(cur.key);
    if (!ok) return;
    if (step() < FLOW.length - 1) setStep(step() + 1);
  };

  const stepLabels = createMemo(() => FLOW.map((s) => s.label));

  return (
    <HrLayout>
      <Show when={!detail.loading && detail()} fallback={<p class="mt-4 text-sm text-text-secondary">Loading application…</p>}>
        {(row) => (
          <div class="space-y-4">
            <HrPageHead
              title={row().full_name}
              subtitle={`${row().position_desired || "No position"} · ${row().email} · ${row().cellphone}`}
              crumb={<A href="/app/hr/applicants">← Applicants</A>}
              actions={
                <div class="flex flex-wrap items-center gap-2">
                  <HrBadge tone="brand">{STATUSES.find((s) => s[0] === status())?.[1] ?? status()}</HrBadge>
                  <Show when={row().has_signature}><HrBadge tone="success">Signature on file</HrBadge></Show>
                </div>
              }
            />

            <HrTcard>
              <div class="p-4">
                <HrSteps
                  steps={stepLabels()}
                  current={step()}
                  onSelect={(i) => setStep(i)}
                />

                <Show when={step() === 0}>
                  <div class="space-y-3">
                    <label class="block text-sm font-medium">
                      Status
                      <select class="mt-1 w-full max-w-sm rounded border border-stroke px-2 py-1.5" value={status()} onChange={(e) => setStatus(e.currentTarget.value)}>
                        {STATUSES.map(([value, label]) => <option value={value}>{label}</option>)}
                      </select>
                    </label>
                    <button type="button" class="rounded bg-brand-600 px-3 py-1.5 text-sm text-white" onClick={() => void saveStatus()}>Save status</button>
                    <section>
                      <h2 class="mb-1 font-medium">Children</h2>
                      <For each={row().children ?? []} fallback={<HrEmpty title="No children listed" />}>
                        {(child) => <p class="text-sm">{child.child_name} {child.birth_date ? `· ${String(child.birth_date).slice(0, 10)}` : ""}</p>}
                      </For>
                    </section>
                    <section>
                      <h2 class="mb-1 font-medium">Employment record</h2>
                      <For each={row().jobs ?? []} fallback={<HrEmpty title="No employment record" />}>
                        {(job) => <p class="text-sm">{job.company_name} · {job.position}</p>}
                      </For>
                    </section>
                    <section>
                      <h2 class="mb-1 font-medium">Character references</h2>
                      <For each={row().references ?? []} fallback={<HrEmpty title="No references" />}>
                        {(ref) => <p class="text-sm">{ref.ref_name} · {ref.position} · {ref.company_name} · {ref.contact_no}</p>}
                      </For>
                    </section>
                    <section>
                      <h2 class="mb-1 font-medium">Files</h2>
                      <For each={row().files ?? []} fallback={<HrEmpty title="No files" />}>
                        {(file) => (
                          <button type="button" class="mr-3 text-sm text-brand-700" onClick={() => void download(file)}>
                            {file.kind}: {file.file_name}
                          </button>
                        )}
                      </For>
                    </section>
                    <section>
                      <h2 class="mb-1 font-medium">Comments</h2>
                      <For each={comments() ?? []} fallback={<HrEmpty title="No comments" />}>
                        {(comment) => <p class="text-sm">{comment.body}{comment.file_name ? ` · ${comment.file_name}` : ""}</p>}
                      </For>
                    </section>
                  </div>
                </Show>

                <Show when={step() === 1}>
                  <div class="space-y-3">
                    <p class="text-sm text-text-secondary">Sets status to Initial interview. Scheduling fields are not stored yet.</p>
                    <label class="block text-sm font-medium">Interview date & time <HrPlanned /></label>
                    <input type="datetime-local" class="w-full max-w-sm rounded border border-stroke px-2 py-1.5" disabled />
                    <label class="block text-sm font-medium">Interviewer <HrPlanned /></label>
                    <input class="w-full max-w-sm rounded border border-stroke px-2 py-1.5" disabled placeholder="—" />
                    <label class="block text-sm font-medium">Mode <HrPlanned /></label>
                    <select class="w-full max-w-sm rounded border border-stroke px-2 py-1.5" disabled>
                      <option>On-site</option>
                      <option>Video</option>
                    </select>
                  </div>
                </Show>

                <Show when={step() === 2}>
                  <div class="space-y-3">
                    <p class="text-sm text-text-secondary">Sets status to Exam. Score fields are not stored yet.</p>
                    <label class="block text-sm font-medium">Exam score (0–100) <HrPlanned /></label>
                    <input type="number" class="w-full max-w-sm rounded border border-stroke px-2 py-1.5" disabled />
                    <label class="block text-sm font-medium">Remarks <HrPlanned /></label>
                    <textarea class="w-full max-w-lg rounded border border-stroke px-2 py-1.5" rows={3} disabled />
                  </div>
                </Show>

                <Show when={step() === 3}>
                  <div class="space-y-3">
                    <p class="text-sm text-text-secondary">Sets status to Final interview.</p>
                    <label class="block text-sm font-medium">Result <HrPlanned /></label>
                    <select class="w-full max-w-sm rounded border border-stroke px-2 py-1.5" disabled>
                      <option>Passed</option>
                      <option>Failed</option>
                      <option>On hold</option>
                    </select>
                    <label class="block text-sm font-medium">Interviewer notes <HrPlanned /></label>
                    <textarea class="w-full max-w-lg rounded border border-stroke px-2 py-1.5" rows={3} disabled />
                  </div>
                </Show>

                <Show when={step() === 4}>
                  <div class="space-y-3">
                    <p class="text-sm text-text-secondary">Sets status to Hired. This does not create an employee record.</p>
                    <label class="block text-sm font-medium">Start date <HrPlanned /></label>
                    <input type="date" class="w-full max-w-sm rounded border border-stroke px-2 py-1.5" disabled />
                    <label class="block text-sm font-medium">Assign to site <HrPlanned /></label>
                    <input class="w-full max-w-sm rounded border border-stroke px-2 py-1.5" disabled placeholder="Use Deployments after the employee exists" />
                    <HrNotice>Hired status updates the application only. Create the employee from Employees or Hire onboarding.</HrNotice>
                  </div>
                </Show>

                <Show when={step() === 5}>
                  <div class="space-y-3">
                    <p class="text-sm text-text-secondary">Sets status to Onboarding. Checklist lives on Hire onboarding.</p>
                    <A href="/app/hr/hire-onboarding" class="text-sm text-brand-700">Open hire onboarding →</A>
                  </div>
                </Show>

                <Show when={step() === 6}>
                  <div class="space-y-3">
                    <p class="text-sm font-medium">Create employee <HrPlanned /></p>
                    <HrNotice>
                      Creating an employee from this application is not enabled. Open Employees to add the person, or Hire onboarding for checklist work.
                    </HrNotice>
                    <div class="flex flex-wrap gap-3">
                      <A href="/app/hr/employees" class="text-sm text-brand-700">Employees →</A>
                      <A href="/app/hr/hire-onboarding" class="text-sm text-brand-700">Hire onboarding →</A>
                    </div>
                  </div>
                </Show>

                <HrWizardNav
                  canBack={step() > 0}
                  canNext={step() < FLOW.length - 1}
                  onBack={() => setStep(Math.max(0, step() - 1))}
                  onNext={() => void goNext()}
                  nextLabel={step() === 6 ? "Done" : step() >= 1 && step() <= 5 ? "Save status & next →" : "Next →"}
                />
              </div>
            </HrTcard>
          </div>
        )}
      </Show>
    </HrLayout>
  );
}
