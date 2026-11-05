import { createResource, createSignal, For } from "solid-js";
import { apiFetch } from "../../shared/api";
import { Field, inputClass, SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";

type Submission = { id: number; client_name: string; site_name: string; period_start: string; period_end: string; status: string };
type Bill = { id: number; client_name: string; site_name: string; period_start: string; period_end: string; total: number };

export default function ClientBillingPage() {
  const toast = useToast();
  const [submissionId, setSubmissionId] = createSignal("");
  const [selected, setSelected] = createSignal<number | null>(null);
  const [submissions] = createResource(async () => (await apiFetch<Submission[]>("/api/v1/hr/client-time")).data ?? []);
  const [rows, { refetch }] = createResource(async () => (await apiFetch<Bill[]>("/api/v1/hr/client-bills")).data ?? []);
  const accepted = () => (submissions() ?? []).filter((row) => row.status === "accepted");

  const save = async () => {
    if (!submissionId()) return toast.warning("Choose an accepted submission.");
    const res = await apiFetch("/api/v1/hr/client-bills", { method: "POST", body: JSON.stringify({ submission_id: Number(submissionId()) }) });
    if (!res.success) return toast.warning(res.message ?? "Could not save the bill.");
    void refetch();
  };

  return (
    <HrLayout>
      <h1 class="mb-4 text-2xl font-semibold">Client billing</h1>
      <p class="mb-3 text-sm text-text-secondary">The total is the accepted hours times that site’s latest bill rate. Employee pay is unchanged.</p>
      <div class="mb-4 grid gap-3 rounded-xl border border-stroke bg-surface p-4 md:grid-cols-2">
        <Field label="Accepted time">
          <select class={inputClass} value={submissionId()} onChange={(e) => setSubmissionId(e.currentTarget.value)}>
            <option value="">Choose</option>
            <For each={accepted()}>{(row) => <option value={row.id}>{row.client_name} · {row.site_name} · {row.period_start}</option>}</For>
          </select>
        </Field>
        <button type="button" class="self-end rounded-lg bg-brand-600 px-4 py-2 text-sm text-white" onClick={() => void save()}>Create bill</button>
      </div>
      <SpreadsheetGrid
        columns={[
          { key: "client_name", header: "Client" },
          { key: "site_name", header: "Site" },
          { key: "period_start", header: "Start" },
          { key: "period_end", header: "End" },
          { key: "total", header: "Total" },
        ]}
        rows={rows() ?? []}
        loading={rows.loading}
        selectedId={selected()}
        onSelect={setSelected}
        onEdit={(row) => setSelected(row.id)}
        onNew={() => {}}
        showNew={false}
        codeKey="client_name"
        nameKey="site_name"
      />
    </HrLayout>
  );
}
