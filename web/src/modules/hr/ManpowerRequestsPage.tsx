import { createResource, createSignal, For } from "solid-js";
import { apiFetch } from "../../shared/api";
import { Field, inputClass, SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";
import { siteChoices } from "./siteChoices";

type RequestRow = { id: number; client_name: string; site_name: string; headcount: number; details: string; status: string };

export default function ManpowerRequestsPage() {
  const toast = useToast();
  const [siteId, setSiteId] = createSignal("");
  const [headcount, setHeadcount] = createSignal("1");
  const [details, setDetails] = createSignal("");
  const [selected, setSelected] = createSignal<number | null>(null);
  const [sites] = createResource(siteChoices);
  const [rows, { refetch }] = createResource(async () => (await apiFetch<RequestRow[]>("/api/v1/hr/manpower-requests")).data ?? []);

  const save = async () => {
    if (!siteId()) return toast.warning("Choose a site.");
    const res = await apiFetch("/api/v1/hr/manpower-requests", {
      method: "POST",
      body: JSON.stringify({ site_id: Number(siteId()), headcount: Number(headcount()) || 1, details: details() }),
    });
    if (!res.success) return toast.warning(res.message ?? "Could not save the request.");
    setDetails("");
    void refetch();
  };

  const setStatus = async (row: RequestRow, status: string) => {
    const res = await apiFetch(`/api/v1/hr/manpower-requests/${row.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    if (!res.success) return toast.warning(res.message ?? "Could not update the request.");
    void refetch();
  };

  return (
    <HrLayout>
      <h1 class="mb-1 text-2xl font-semibold">Manpower requests</h1>
      <p class="mb-4 text-sm text-text-secondary">Headcount requests from a client or from HR. Filling a request does not hire anyone.</p>
      <div class="mb-4 grid gap-3 rounded-xl border border-stroke bg-surface p-4 md:grid-cols-4">
        <Field label="Site">
          <select class={inputClass} value={siteId()} onChange={(e) => setSiteId(e.currentTarget.value)}>
            <option value="">Choose</option>
            <For each={sites() ?? []}>{(site) => <option value={site.id}>{site.client_name} · {site.site_name}</option>}</For>
          </select>
        </Field>
        <Field label="Headcount"><input class={inputClass} value={headcount()} onInput={(e) => setHeadcount(e.currentTarget.value)} /></Field>
        <Field label="Details"><input class={inputClass} value={details()} onInput={(e) => setDetails(e.currentTarget.value)} /></Field>
        <button type="button" class="self-end rounded-lg bg-brand-600 px-4 py-2 text-sm text-white" onClick={() => void save()}>Save request</button>
      </div>
      <SpreadsheetGrid
        columns={[
          { key: "client_name", header: "Client" },
          { key: "site_name", header: "Site" },
          { key: "headcount", header: "Headcount" },
          { key: "details", header: "Details" },
          { key: "status", header: "Status", render: (row) => (
            <select class={inputClass} value={row.status} onChange={(e) => void setStatus(row, e.currentTarget.value)}>
              <option value="open">open</option>
              <option value="filled">filled</option>
              <option value="closed">closed</option>
            </select>
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
