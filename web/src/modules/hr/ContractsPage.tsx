import { createResource, createSignal, For } from "solid-js";
import { apiFetch } from "../../shared/api";
import { Field, inputClass, SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";
import { HrPageHead } from "./HrUi";
import { siteChoices, type SiteChoice } from "./siteChoices";

type Order = { id: number; site_name: string; client_name: string; pay_rate: number; bill_rate: number };
type Posting = { id: number; site_name: string; client_name: string; title: string; headcount: number; status: string };

export default function ContractsPage() {
  const toast = useToast();
  const [siteId, setSiteId] = createSignal("");
  const [pay, setPay] = createSignal("");
  const [bill, setBill] = createSignal("");
  const [title, setTitle] = createSignal("");
  const [headcount, setHeadcount] = createSignal("1");
  const [selected, setSelected] = createSignal<number | null>(null);
  const [clients] = createResource(siteChoices);
  const [rows, { refetch }] = createResource(async () => (await apiFetch<Order[]>("/api/v1/hr/job-orders")).data ?? []);
  const [postings, { refetch: refetchPostings }] = createResource(async () => (await apiFetch<Posting[]>("/api/v1/hr/job-postings")).data ?? []);

  const save = async () => {
    if (!siteId()) return toast.warning("Choose a site.");
    const res = await apiFetch("/api/v1/hr/job-orders", {
      method: "POST",
      body: JSON.stringify({ site_id: Number(siteId()), pay_rate: Number(pay()) || 0, bill_rate: Number(bill()) || 0 }),
    });
    if (!res.success) return toast.warning(res.message ?? "Could not save the job order.");
    setPay("");
    setBill("");
    void refetch();
  };

  const savePosting = async () => {
    if (!siteId() || !title().trim()) return toast.warning("Choose a site and a title.");
    const res = await apiFetch("/api/v1/hr/job-postings", {
      method: "POST",
      body: JSON.stringify({ site_id: Number(siteId()), title: title().trim(), headcount: Number(headcount()) || 1 }),
    });
    if (!res.success) return toast.warning(res.message ?? "Could not save the posting.");
    setTitle("");
    void refetchPostings();
  };

  return (
    <HrLayout>
      <HrPageHead title="Contracts & job orders" subtitle="Job orders hold the pay rate and the bill rate. Public openings are separate and do not show rates." />
      <div class="mb-4 grid gap-3 rounded-xl border border-stroke bg-surface p-4 grid-cols-1 min-[1024px]:grid-cols-4">
        <SiteField sites={clients() ?? []} value={siteId()} onChange={setSiteId} />
        <Field label="Pay rate"><input class={inputClass} value={pay()} onInput={(e) => setPay(e.currentTarget.value)} /></Field>
        <Field label="Bill rate"><input class={inputClass} value={bill()} onInput={(e) => setBill(e.currentTarget.value)} /></Field>
        <button type="button" class="self-end rounded-lg bg-brand-600 px-4 py-2 text-sm text-white" onClick={() => void save()}>Save job order</button>
      </div>
      <SpreadsheetGrid
        columns={[
          { key: "client_name", header: "Client" },
          { key: "site_name", header: "Site" },
          { key: "pay_rate", header: "Pay rate" },
          { key: "bill_rate", header: "Bill rate" },
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
      <h2 class="mb-3 mt-8 text-lg font-semibold">Public openings</h2>
      <p class="mb-3 text-sm text-text-secondary">These titles appear on the public application form. Pay rates stay on the job order above.</p>
      <div class="mb-4 grid gap-3 rounded-xl border border-stroke bg-surface p-4 grid-cols-1 min-[1024px]:grid-cols-4">
        <SiteField sites={clients() ?? []} value={siteId()} onChange={setSiteId} />
        <Field label="Title"><input class={inputClass} value={title()} onInput={(e) => setTitle(e.currentTarget.value)} /></Field>
        <Field label="Headcount"><input class={inputClass} value={headcount()} onInput={(e) => setHeadcount(e.currentTarget.value)} /></Field>
        <button type="button" class="self-end rounded-lg bg-brand-600 px-4 py-2 text-sm text-white" onClick={() => void savePosting()}>Save opening</button>
      </div>
      <For each={postings() ?? []} fallback={<p class="text-sm text-text-secondary">No openings yet.</p>}>
        {(row) => <p class="border-t border-stroke py-2 text-sm">{row.title} · {row.client_name} · {row.site_name} · {row.headcount} · {row.status}</p>}
      </For>
    </HrLayout>
  );
}

function SiteField(props: { sites: SiteChoice[]; value: string; onChange: (value: string) => void }) {
  return (
    <Field label="Site">
      <select class={inputClass} value={props.value} onChange={(e) => props.onChange(e.currentTarget.value)}>
        <option value="">Choose</option>
        <For each={props.sites}>{(site) => <option value={site.id}>{site.client_name} · {site.site_name}</option>}</For>
      </select>
    </Field>
  );
}
