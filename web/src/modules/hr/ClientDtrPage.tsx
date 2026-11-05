import { createResource, createSignal, For } from "solid-js";
import { apiBase, apiFetch, getAccessToken } from "../../shared/api";
import { Field, inputClass, SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";
import { siteChoices } from "./siteChoices";

type Submission = { id: number; client_name: string; site_name: string; period_start: string; period_end: string; status: string; file_name: string; accepted_hours: number };

export default function ClientDtrPage() {
  const toast = useToast();
  const [siteId, setSiteId] = createSignal("");
  const [start, setStart] = createSignal("");
  const [end, setEnd] = createSignal("");
  const [file, setFile] = createSignal<File | null>(null);
  const [hours, setHours] = createSignal<Record<number, string>>({});
  const [selected, setSelected] = createSignal<number | null>(null);
  const [sites] = createResource(siteChoices);
  const [rows, { refetch }] = createResource(async () => (await apiFetch<Submission[]>("/api/v1/hr/client-time")).data ?? []);

  const save = async () => {
    if (!siteId() || !start() || !end()) return toast.warning("Choose a site and a period.");
    const data = new FormData();
    data.set("site_id", siteId());
    data.set("period_start", start());
    data.set("period_end", end());
    if (file()) data.set("file", file()!);
    const token = await getAccessToken();
    const res = await fetch(`${apiBase}/api/v1/hr/client-time`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: data,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.success === false) return toast.warning(body.message ?? "Could not save the submission.");
    void refetch();
  };

  const accept = async (row: Submission) => {
    const res = await apiFetch(`/api/v1/hr/client-time/${row.id}/accept`, {
      method: "POST",
      body: JSON.stringify({ accepted_hours: Number(hours()[row.id] ?? row.accepted_hours) || 0 }),
    });
    if (!res.success) return toast.warning(res.message ?? "Could not accept the submission.");
    void refetch();
  };

  return (
    <HrLayout>
      <h1 class="mb-4 text-2xl font-semibold">Client DTR inbox</h1>
      <p class="mb-3 text-sm text-text-secondary">Accepted hours stay here. They are not written into attendance.</p>
      <div class="mb-4 grid gap-3 rounded-xl border border-stroke bg-surface p-4 md:grid-cols-5">
        <Field label="Site">
          <select class={inputClass} value={siteId()} onChange={(e) => setSiteId(e.currentTarget.value)}>
            <option value="">Choose</option>
            <For each={sites() ?? []}>{(site) => <option value={site.id}>{site.client_name} · {site.site_name}</option>}</For>
          </select>
        </Field>
        <Field label="Period start"><input type="date" class={inputClass} value={start()} onInput={(e) => setStart(e.currentTarget.value)} /></Field>
        <Field label="Period end"><input type="date" class={inputClass} value={end()} onInput={(e) => setEnd(e.currentTarget.value)} /></Field>
        <Field label="File"><input type="file" class={inputClass} onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)} /></Field>
        <button type="button" class="self-end rounded-lg bg-brand-600 px-4 py-2 text-sm text-white" onClick={() => void save()}>Save submission</button>
      </div>
      <SpreadsheetGrid
        columns={[
          { key: "client_name", header: "Client" },
          { key: "site_name", header: "Site" },
          { key: "period_start", header: "Start" },
          { key: "period_end", header: "End" },
          { key: "file_name", header: "File" },
          { key: "status", header: "Status" },
          { key: "accepted_hours", header: "Accepted hours", render: (row) => row.status === "accepted" ? String(row.accepted_hours) : (
            <span class="flex gap-2">
              <input class={inputClass} value={hours()[row.id] ?? ""} onInput={(e) => setHours({ ...hours(), [row.id]: e.currentTarget.value })} />
              <button type="button" class="text-sm text-brand-700" onClick={() => void accept(row)}>Accept</button>
            </span>
          ) },
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
