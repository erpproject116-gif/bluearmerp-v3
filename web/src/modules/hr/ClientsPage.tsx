import { createResource, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { LookupCombo } from "../../shared/LookupCombo";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { fetchEmployeeOptions } from "../../shared/useHr";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";

type Person = { employee_id: number; employee_name: string; start_date: string };
type Site = { id: number; site_name: string; industry_id: number; industry_name: string; people: Person[] };
type Client = { id: number; name: string; partner_id: number; partner_code: string; partner_name: string; sites: Site[] };
type Customer = { id: number; partner_code: string; company_name: string };
type Segment = { id: number; kind: string; name: string };

export default function ClientsPage() {
  const toast = useToast();
  const [source, setSource] = createSignal<"existing" | "new">("existing");
  const [partnerId, setPartnerId] = createSignal("");
  const [name, setName] = createSignal("");
  const [siteName, setSiteName] = createSignal("");
  const [industryId, setIndustryId] = createSignal("");
  const [empId, setEmpId] = createSignal<number | null>(null);
  const [empLabel, setEmpLabel] = createSignal("");
  const [startDate, setStartDate] = createSignal("");
  const [addClientId, setAddClientId] = createSignal("");
  const [addSite, setAddSite] = createSignal("");
  const [addIndustry, setAddIndustry] = createSignal("");
  const [addEmpId, setAddEmpId] = createSignal<number | null>(null);
  const [addEmpLabel, setAddEmpLabel] = createSignal("");
  const [addStart, setAddStart] = createSignal("");

  const [clients, { refetch }] = createResource(async () => (await apiFetch<Client[]>("/api/v1/hr/clients")).data ?? []);
  const [customers] = createResource(async () => (await apiFetch<Customer[]>("/api/v1/hr/sales-customers")).data ?? []);
  const [segments] = createResource(async () => (await apiFetch<Segment[]>("/api/v1/hr/applicant-segments")).data ?? []);
  const industries = () => (segments() ?? []).filter((row) => row.kind === "industry");

  const payloadPerson = (id: number | null, start: string) => (id ? { employee_id: id, start_date: start } : {});

  const createClient = async () => {
    if (!siteName().trim() || !industryId()) return toast.warning("Enter a site name and an industry.");
    if (source() === "existing" && !partnerId()) return toast.warning("Choose a sales customer.");
    if (source() === "new" && !name().trim()) return toast.warning("Enter a client name.");
    const res = await apiFetch("/api/v1/hr/clients", {
      method: "POST",
      body: JSON.stringify({
        partner_id: source() === "existing" ? Number(partnerId()) : 0,
        name: name().trim(),
        site_name: siteName().trim(),
        industry_id: Number(industryId()),
        ...payloadPerson(empId(), startDate()),
      }),
    });
    if (!res.success) return toast.warning(res.message ?? "Could not save the client.");
    setSiteName("");
    setName("");
    setEmpId(null);
    setEmpLabel("");
    void refetch();
  };

  const addSiteToClient = async () => {
    if (!addClientId() || !addSite().trim() || !addIndustry()) return toast.warning("Choose a client, a site name, and an industry.");
    const res = await apiFetch(`/api/v1/hr/clients/${addClientId()}/sites`, {
      method: "POST",
      body: JSON.stringify({
        site_name: addSite().trim(),
        industry_id: Number(addIndustry()),
        ...payloadPerson(addEmpId(), addStart()),
      }),
    });
    if (!res.success) return toast.warning(res.message ?? "Could not save the site.");
    setAddSite("");
    setAddEmpId(null);
    setAddEmpLabel("");
    void refetch();
  };

  return (
    <HrLayout>
      <h1 class="mb-1 text-2xl font-semibold">Clients & sites</h1>
      <p class="mb-4 text-sm text-text-secondary">Client companies, their sites, and the industry of each site.</p>
      <div class="mb-4 overflow-x-auto rounded-xl border border-stroke bg-surface">
        <table>
          <thead>
            <tr><th>Client</th><th>Sales customer</th><th>Sites</th><th>People on sites</th></tr>
          </thead>
          <tbody>
            <For each={clients() ?? []} fallback={<tr><td colspan="4">No clients yet.</td></tr>}>
              {(client) => (
                <tr>
                  <td>{client.name}</td>
                  <td>{client.partner_name}</td>
                  <td>{(client.sites ?? []).map((site) => site.site_name).join(", ") || "—"}</td>
                  <td class="tabular-nums">{(client.sites ?? []).reduce((sum, site) => sum + (site.people ?? []).length, 0)}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
      <div class="mb-4 grid gap-3 rounded-xl border border-stroke bg-surface p-4 md:grid-cols-2">
        <Field label="Client">
          <select class={inputClass} value={source()} onChange={(e) => setSource(e.currentTarget.value as "existing" | "new")}>
            <option value="existing">Existing sales customer</option>
            <option value="new">New HR client</option>
          </select>
        </Field>
        <Show when={source() === "existing"} fallback={
          <Field label="Client name"><input class={inputClass} value={name()} onInput={(e) => setName(e.currentTarget.value)} /></Field>
        }>
          <Field label="Sales customer">
            <select class={inputClass} value={partnerId()} onChange={(e) => setPartnerId(e.currentTarget.value)}>
              <option value="">Choose</option>
              <For each={customers() ?? []}>{(row) => <option value={row.id}>{row.company_name} ({row.partner_code})</option>}</For>
            </select>
          </Field>
        </Show>
        <Field label="Site name"><input class={inputClass} value={siteName()} onInput={(e) => setSiteName(e.currentTarget.value)} /></Field>
        <Field label="Industry">
          <select class={inputClass} value={industryId()} onChange={(e) => setIndustryId(e.currentTarget.value)}>
            <option value="">Choose</option>
            <For each={industries()}>{(row) => <option value={row.id}>{row.name}</option>}</For>
          </select>
        </Field>
        <LookupCombo label="Hired employee" value={empLabel} selectedId={empId} onInput={setEmpLabel} onSelect={(o) => { setEmpId(o.id); setEmpLabel(o.label); }} onClear={() => { setEmpId(null); setEmpLabel(""); }} fetchOptions={(q) => fetchEmployeeOptions(q)} placeholder="Optional" />
        <Field label="Start date"><input type="date" class={inputClass} value={startDate()} onInput={(e) => setStartDate(e.currentTarget.value)} /></Field>
        <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white md:col-span-2" onClick={() => void createClient()}>Save client</button>
      </div>

      <div class="mb-6 grid gap-3 rounded-xl border border-stroke bg-surface p-4 md:grid-cols-2">
        <Field label="Add a site to">
          <select class={inputClass} value={addClientId()} onChange={(e) => setAddClientId(e.currentTarget.value)}>
            <option value="">Choose</option>
            <For each={clients() ?? []}>{(row) => <option value={row.id}>{row.name}</option>}</For>
          </select>
        </Field>
        <Field label="Site name"><input class={inputClass} value={addSite()} onInput={(e) => setAddSite(e.currentTarget.value)} /></Field>
        <Field label="Industry">
          <select class={inputClass} value={addIndustry()} onChange={(e) => setAddIndustry(e.currentTarget.value)}>
            <option value="">Choose</option>
            <For each={industries()}>{(row) => <option value={row.id}>{row.name}</option>}</For>
          </select>
        </Field>
        <LookupCombo label="Hired employee" value={addEmpLabel} selectedId={addEmpId} onInput={setAddEmpLabel} onSelect={(o) => { setAddEmpId(o.id); setAddEmpLabel(o.label); }} onClear={() => { setAddEmpId(null); setAddEmpLabel(""); }} fetchOptions={(q) => fetchEmployeeOptions(q)} placeholder="Optional" />
        <Field label="Start date"><input type="date" class={inputClass} value={addStart()} onInput={(e) => setAddStart(e.currentTarget.value)} /></Field>
        <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white" onClick={() => void addSiteToClient()}>Save site</button>
      </div>

      <Show when={!clients.loading} fallback={<p class="text-sm text-text-secondary">Loading clients…</p>}>
        <div class="grid gap-3">
          <For each={clients() ?? []} fallback={<p class="text-sm text-text-secondary">No clients yet.</p>}>
            {(client) => (
              <section class="rounded-xl border border-stroke bg-surface p-4">
                <h2 class="text-base font-semibold">{client.name}</h2>
                <p class="mb-3 text-sm text-text-secondary">Sales customer {client.partner_name} ({client.partner_code})</p>
                <div class="grid gap-3 md:grid-cols-2">
                  <For each={client.sites ?? []}>
                    {(site) => (
                      <div class="rounded-lg border border-stroke bg-panel p-3">
                        <p class="font-medium">{site.site_name}</p>
                        <p class="text-sm text-text-secondary">{site.industry_name}</p>
                        <ul class="mt-2 text-sm">
                          <For each={site.people ?? []} fallback={<li class="text-text-secondary">No hired people on this site.</li>}>
                            {(person) => <li>{person.employee_name} · {person.start_date}</li>}
                          </For>
                        </ul>
                      </div>
                    )}
                  </For>
                </div>
              </section>
            )}
          </For>
        </div>
      </Show>
    </HrLayout>
  );
}
