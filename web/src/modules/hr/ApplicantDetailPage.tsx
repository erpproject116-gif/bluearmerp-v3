import { A, useParams } from "@solidjs/router";
import { createResource, createSignal, For, Show } from "solid-js";
import { apiBase, apiFetch, getAccessToken } from "../../shared/api";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";

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

export default function ApplicantDetailPage() {
  const params = useParams<{ id: string }>();
  const toast = useToast();
  const [status, setStatus] = createSignal("");
  const [detail, { refetch }] = createResource(
    () => params.id,
    async (id) => {
      const res = await apiFetch<ApplicationDetail>(`/api/v1/hr/applications/${id}`);
      if (!res.success || !res.data) return null;
      setStatus(res.data.status);
      return res.data;
    },
  );
  const [comments] = createResource(
    () => params.id,
    async (id) => (await apiFetch<Comment[]>(`/api/v1/hr/applications/${id}/comments`)).data ?? [],
  );

  const saveStatus = async () => {
    const res = await apiFetch(`/api/v1/hr/applications/${params.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: status() }),
    });
    if (!res.success) {
      toast.warning(res.message ?? "Could not update the status.");
      return;
    }
    toast.success("Status saved.");
    void refetch();
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

  return (
    <HrLayout>
      <A href="/app/hr/applicants" class="text-sm text-brand-700">Applicants</A>
      <Show when={!detail.loading && detail()} fallback={<p class="mt-4 text-sm text-text-secondary">Loading application…</p>}>
        {(row) => (
          <div class="mt-3 space-y-4">
            <h1 class="text-2xl font-semibold">{row().full_name}</h1>
            <p class="text-sm text-text-secondary">{row().position_desired || "No position"} · {row().email} · {row().cellphone}</p>
            <p class="text-sm">Signature on file: {row().has_signature ? "Yes" : "No"}</p>
            <label class="block text-sm">
              Status
              <select class="ml-2 rounded border border-stroke px-2 py-1" value={status()} onChange={(e) => setStatus(e.currentTarget.value)}>
                {STATUSES.map(([value, label]) => <option value={value}>{label}</option>)}
              </select>
            </label>
            <button type="button" class="rounded bg-brand-600 px-3 py-1.5 text-sm text-white" onClick={() => void saveStatus()}>Save status</button>
            <section>
              <h2 class="font-medium">Children</h2>
              <For each={row().children ?? []} fallback={<p class="text-sm text-text-secondary">None</p>}>
                {(child) => <p class="text-sm">{child.child_name} {child.birth_date ? `· ${String(child.birth_date).slice(0, 10)}` : ""}</p>}
              </For>
            </section>
            <section>
              <h2 class="font-medium">Employment record</h2>
              <For each={row().jobs ?? []} fallback={<p class="text-sm text-text-secondary">None</p>}>
                {(job) => <p class="text-sm">{job.company_name} · {job.position}</p>}
              </For>
            </section>
            <section>
              <h2 class="font-medium">Character references</h2>
              <For each={row().references ?? []} fallback={<p class="text-sm text-text-secondary">None</p>}>
                {(ref) => <p class="text-sm">{ref.ref_name} · {ref.position} · {ref.company_name} · {ref.contact_no}</p>}
              </For>
            </section>
            <section>
              <h2 class="font-medium">Files</h2>
              <For each={row().files ?? []} fallback={<p class="text-sm text-text-secondary">None</p>}>
                {(file) => (
                  <button type="button" class="mr-3 text-sm text-brand-700" onClick={() => void download(file)}>
                    {file.kind}: {file.file_name}
                  </button>
                )}
              </For>
            </section>
            <section>
              <h2 class="font-medium">Comments</h2>
              <For each={comments() ?? []} fallback={<p class="text-sm text-text-secondary">None</p>}>
                {(comment) => <p class="text-sm">{comment.body}{comment.file_name ? ` · ${comment.file_name}` : ""}</p>}
              </For>
            </section>
          </div>
        )}
      </Show>
    </HrLayout>
  );
}
