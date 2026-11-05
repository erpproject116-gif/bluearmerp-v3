import { A } from "@solidjs/router";
import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { LookupCombo } from "../../shared/LookupCombo";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { fetchEmployeeOptions } from "../../shared/useHr";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";
import { HrBadge, HrEmpty, HrPageHead, HrTcard } from "./HrUi";

type Person = {
  employee_id: number;
  employee_name: string;
  start_date: string;
};
type Site = {
  id: number;
  site_name: string;
  industry_id: number;
  industry_name: string;
  people: Person[];
};
type Client = {
  id: number;
  name: string;
  partner_id: number;
  partner_code: string;
  partner_name: string;
  sites: Site[];
};
type Customer = { id: number; partner_code: string; company_name: string };
type Segment = { id: number; kind: string; name: string };

type InnerTab = "c" | "b" | "i";

export default function ClientsPage() {
  const toast = useToast();
  const [innerTab, setInnerTab] = createSignal<InnerTab>("c");
  const [search, setSearch] = createSignal("");
  const [industryFilter, setIndustryFilter] = createSignal("");
  const [branchSearch, setBranchSearch] = createSignal("");
  const [modalOpen, setModalOpen] = createSignal(false);
  const [siteModalOpen, setSiteModalOpen] = createSignal(false);

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

  const [clients, { refetch }] = createResource(
    async () => (await apiFetch<Client[]>("/api/v1/hr/clients")).data ?? [],
  );
  const [customers] = createResource(
    async () =>
      (await apiFetch<Customer[]>("/api/v1/hr/sales-customers")).data ?? [],
  );
  const [segments] = createResource(
    async () =>
      (await apiFetch<Segment[]>("/api/v1/hr/applicant-segments")).data ?? [],
  );
  const industries = () =>
    (segments() ?? []).filter((row) => row.kind === "industry");

  const clientRows = createMemo(() => {
    const q = search().trim().toLowerCase();
    const ind = industryFilter();
    return (clients() ?? [])
      .map((client) => {
        const sites = client.sites ?? [];
        const industryNames = [
          ...new Set(sites.map((s) => s.industry_name).filter(Boolean)),
        ];
        const deployed = sites.reduce(
          (sum, site) => sum + (site.people ?? []).length,
          0,
        );
        return {
          ...client,
          branchCount: sites.length,
          deployed,
          industryLabel: industryNames.join(", ") || "—",
          industryNames,
          status: deployed > 0 || sites.length > 0 ? "Active" : "Prospect",
        };
      })
      .filter((row) => {
        if (ind && !row.industryNames.includes(ind)) return false;
        if (!q) return true;
        return (
          row.name.toLowerCase().includes(q) ||
          row.partner_name.toLowerCase().includes(q) ||
          row.industryLabel.toLowerCase().includes(q)
        );
      });
  });

  const branchRows = createMemo(() => {
    const q = branchSearch().trim().toLowerCase();
    const out: {
      id: string;
      site_name: string;
      client_name: string;
      industry_name: string;
      deployed: number;
      people: Person[];
    }[] = [];
    for (const client of clients() ?? []) {
      for (const site of client.sites ?? []) {
        out.push({
          id: `${client.id}-${site.id}`,
          site_name: site.site_name,
          client_name: client.name,
          industry_name: site.industry_name || "—",
          deployed: (site.people ?? []).length,
          people: site.people ?? [],
        });
      }
    }
    if (!q) return out;
    return out.filter(
      (row) =>
        row.site_name.toLowerCase().includes(q) ||
        row.client_name.toLowerCase().includes(q) ||
        row.industry_name.toLowerCase().includes(q),
    );
  });

  const payloadPerson = (id: number | null, start: string) =>
    id ? { employee_id: id, start_date: start } : {};

  const createClient = async () => {
    if (!siteName().trim() || !industryId())
      return toast.warning("Enter a site name and an industry.");
    if (source() === "existing" && !partnerId())
      return toast.warning("Choose a sales customer.");
    if (source() === "new" && !name().trim())
      return toast.warning("Enter a client name.");
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
    if (!res.success)
      return toast.warning(res.message ?? "Could not save the client.");
    setSiteName("");
    setName("");
    setEmpId(null);
    setEmpLabel("");
    setModalOpen(false);
    void refetch();
    toast.success("Client saved.");
  };

  const addSiteToClient = async () => {
    if (!addClientId() || !addSite().trim() || !addIndustry())
      return toast.warning("Choose a client, a site name, and an industry.");
    const res = await apiFetch(`/api/v1/hr/clients/${addClientId()}/sites`, {
      method: "POST",
      body: JSON.stringify({
        site_name: addSite().trim(),
        industry_id: Number(addIndustry()),
        ...payloadPerson(addEmpId(), addStart()),
      }),
    });
    if (!res.success)
      return toast.warning(res.message ?? "Could not save the site.");
    setAddSite("");
    setAddEmpId(null);
    setAddEmpLabel("");
    setSiteModalOpen(false);
    void refetch();
    toast.success("Site saved.");
  };

  const openAddSite = (clientId?: number) => {
    setAddClientId(clientId ? String(clientId) : "");
    setAddSite("");
    setAddIndustry("");
    setAddEmpId(null);
    setAddEmpLabel("");
    setAddStart("");
    setSiteModalOpen(true);
  };

  return (
    <HrLayout>
      <HrPageHead
        title="Clients & sites"
        subtitle="Client companies, their branches/worksites and industries."
        actions={
          <div class="hr-actions">
            <button type="button" class="hr-btn" onClick={() => openAddSite()}>
              + Add site
            </button>
            <button
              type="button"
              class="hr-btn hr-btn-primary"
              onClick={() => setModalOpen(true)}
            >
              + New client
            </button>
          </div>
        }
      />

      <div class="hr-tabs" role="tablist" aria-label="Clients sections">
        <button
          type="button"
          role="tab"
          classList={{ on: innerTab() === "c" }}
          aria-selected={innerTab() === "c"}
          onClick={() => setInnerTab("c")}
        >
          Clients
        </button>
        <button
          type="button"
          role="tab"
          classList={{ on: innerTab() === "b" }}
          aria-selected={innerTab() === "b"}
          onClick={() => setInnerTab("b")}
        >
          Branches / sites
        </button>
        <button
          type="button"
          role="tab"
          classList={{ on: innerTab() === "i" }}
          aria-selected={innerTab() === "i"}
          onClick={() => setInnerTab("i")}
        >
          Industries
        </button>
      </div>

      <Show when={innerTab() === "c"}>
        <HrTcard
          toolbar={
            <>
              <input
                class="grow rounded-lg border border-stroke bg-surface px-3 py-2 text-sm"
                placeholder="Search client…"
                aria-label="Search"
                value={search()}
                onInput={(e) => setSearch(e.currentTarget.value)}
              />
              <select
                class="rounded-lg border border-stroke bg-surface px-2 text-sm"
                aria-label="Industry"
                value={industryFilter()}
                onChange={(e) => setIndustryFilter(e.currentTarget.value)}
              >
                <option value="">Industry: All</option>
                <For each={industries()}>
                  {(row) => <option value={row.name}>{row.name}</option>}
                </For>
              </select>
            </>
          }
        >
          <div class="hr-tbl-wrap">
            <table class="hr-tbl">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Industry</th>
                  <th class="num">Branches</th>
                  <th class="num">Deployed</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                <For
                  each={clientRows()}
                  fallback={
                    <tr>
                      <td colspan="6">
                        <HrEmpty
                          title="No matches"
                          hint="Try a different search or clear the filters."
                        />
                      </td>
                    </tr>
                  }
                >
                  {(row) => (
                    <tr>
                      <td>
                        <div class="font-semibold">{row.name}</div>
                        <div class="hr-muted">{row.partner_name}</div>
                      </td>
                      <td>{row.industryLabel}</td>
                      <td class="num">{row.branchCount}</td>
                      <td class="num">{row.deployed}</td>
                      <td>
                        <HrBadge
                          tone={row.status === "Active" ? "success" : "neutral"}
                        >
                          {row.status}
                        </HrBadge>
                      </td>
                      <td>
                        <details class="hr-menu hr-rowmenu">
                          <summary
                            class="hr-rowmenu-btn"
                            aria-label="Row actions"
                          >
                            ⋯
                          </summary>
                          <div>
                            <button
                              type="button"
                              class="menu-item"
                              onClick={() => setInnerTab("b")}
                            >
                              Open sites
                            </button>
                            <button
                              type="button"
                              class="menu-item"
                              onClick={() => openAddSite(row.id)}
                            >
                              Add branch
                            </button>
                            <A
                              class="menu-item"
                              href="/app/hr/clients/portal-access"
                            >
                              Client Rep users
                            </A>
                          </div>
                        </details>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </HrTcard>
      </Show>

      <Show when={innerTab() === "b"}>
        <HrTcard
          toolbar={
            <input
              class="grow rounded-lg border border-stroke bg-surface px-3 py-2 text-sm"
              placeholder="Search branch…"
              aria-label="Search"
              value={branchSearch()}
              onInput={(e) => setBranchSearch(e.currentTarget.value)}
            />
          }
        >
          <div class="hr-tbl-wrap">
            <table class="hr-tbl">
              <thead>
                <tr>
                  <th>Branch</th>
                  <th>Client</th>
                  <th>Industry</th>
                  <th class="num">Deployed</th>
                </tr>
              </thead>
              <tbody>
                <For
                  each={branchRows()}
                  fallback={
                    <tr>
                      <td colspan="4">
                        <HrEmpty
                          title="No sites yet"
                          hint="Add a client with a site, or use Add site."
                        />
                      </td>
                    </tr>
                  }
                >
                  {(row) => (
                    <tr>
                      <td class="font-semibold">{row.site_name}</td>
                      <td>{row.client_name}</td>
                      <td>{row.industry_name}</td>
                      <td class="num">{row.deployed}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </HrTcard>
      </Show>

      <Show when={innerTab() === "i"}>
        <div class="rounded-lg border border-stroke bg-surface p-4 text-sm">
          Industries reuse the existing Applicants “Manage lists → industry”
          list.
          <div class="mt-3 flex flex-wrap gap-2">
            <For
              each={industries()}
              fallback={
                <span class="hr-muted">No industries configured yet.</span>
              }
            >
              {(row) => <HrBadge tone="info">{row.name}</HrBadge>}
            </For>
          </div>
        </div>
      </Show>

      <Show when={modalOpen()}>
        <div
          class="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="New client"
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "Escape") setModalOpen(false);
          }}
        >
          <div class="max-h-[90vh] w-full max-w-lg overflow-auto rounded-lg border border-stroke bg-surface p-4 shadow-lg">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold">New client</h2>
              <button
                type="button"
                class="hr-btn hr-btn-sm"
                aria-label="Close"
                onClick={() => setModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <Field label="Client source">
                <select
                  class={inputClass}
                  value={source()}
                  onChange={(e) =>
                    setSource(e.currentTarget.value as "existing" | "new")
                  }
                >
                  <option value="existing">Existing sales customer</option>
                  <option value="new">New HR client</option>
                </select>
              </Field>
              <Show
                when={source() === "existing"}
                fallback={
                  <Field label="Client name">
                    <input
                      class={inputClass}
                      value={name()}
                      onInput={(e) => setName(e.currentTarget.value)}
                    />
                  </Field>
                }
              >
                <Field label="Sales customer">
                  <select
                    class={inputClass}
                    value={partnerId()}
                    onChange={(e) => setPartnerId(e.currentTarget.value)}
                  >
                    <option value="">Choose</option>
                    <For each={customers() ?? []}>
                      {(row) => (
                        <option value={row.id}>
                          {row.company_name} ({row.partner_code})
                        </option>
                      )}
                    </For>
                  </select>
                </Field>
              </Show>
              <Field label="Site name">
                <input
                  class={inputClass}
                  value={siteName()}
                  onInput={(e) => setSiteName(e.currentTarget.value)}
                />
              </Field>
              <Field label="Industry">
                <select
                  class={inputClass}
                  value={industryId()}
                  onChange={(e) => setIndustryId(e.currentTarget.value)}
                >
                  <option value="">Choose</option>
                  <For each={industries()}>
                    {(row) => <option value={row.id}>{row.name}</option>}
                  </For>
                </select>
              </Field>
              <LookupCombo
                label="Hired employee (optional)"
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
                placeholder="Optional"
              />
              <Field label="Start date">
                <input
                  type="date"
                  class={inputClass}
                  value={startDate()}
                  onInput={(e) => setStartDate(e.currentTarget.value)}
                />
              </Field>
            </div>
            <div class="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                class="hr-btn"
                onClick={() => setModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                class="hr-btn hr-btn-primary"
                onClick={() => void createClient()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={siteModalOpen()}>
        <div
          class="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Add site"
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "Escape") setSiteModalOpen(false);
          }}
        >
          <div class="w-full max-w-md rounded-lg border border-stroke bg-surface p-4 shadow-lg">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold">Add branch / site</h2>
              <button
                type="button"
                class="hr-btn hr-btn-sm"
                aria-label="Close"
                onClick={() => setSiteModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <div class="grid gap-3">
              <Field label="Client">
                <select
                  class={inputClass}
                  value={addClientId()}
                  onChange={(e) => setAddClientId(e.currentTarget.value)}
                >
                  <option value="">Choose</option>
                  <For each={clients() ?? []}>
                    {(row) => <option value={row.id}>{row.name}</option>}
                  </For>
                </select>
              </Field>
              <Field label="Site name">
                <input
                  class={inputClass}
                  value={addSite()}
                  onInput={(e) => setAddSite(e.currentTarget.value)}
                />
              </Field>
              <Field label="Industry">
                <select
                  class={inputClass}
                  value={addIndustry()}
                  onChange={(e) => setAddIndustry(e.currentTarget.value)}
                >
                  <option value="">Choose</option>
                  <For each={industries()}>
                    {(row) => <option value={row.id}>{row.name}</option>}
                  </For>
                </select>
              </Field>
              <LookupCombo
                label="Hired employee (optional)"
                value={addEmpLabel}
                selectedId={addEmpId}
                onInput={setAddEmpLabel}
                onSelect={(o) => {
                  setAddEmpId(o.id);
                  setAddEmpLabel(o.label);
                }}
                onClear={() => {
                  setAddEmpId(null);
                  setAddEmpLabel("");
                }}
                fetchOptions={(q) => fetchEmployeeOptions(q)}
                placeholder="Optional"
              />
              <Field label="Start date">
                <input
                  type="date"
                  class={inputClass}
                  value={addStart()}
                  onInput={(e) => setAddStart(e.currentTarget.value)}
                />
              </Field>
            </div>
            <div class="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                class="hr-btn"
                onClick={() => setSiteModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                class="hr-btn hr-btn-primary"
                onClick={() => void addSiteToClient()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </Show>
    </HrLayout>
  );
}
