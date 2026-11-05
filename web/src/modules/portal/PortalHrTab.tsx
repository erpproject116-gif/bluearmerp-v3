import { createResource, createSignal, For, Show } from "solid-js";
import { portalFetch } from "../../shared/portal-api";
import { formatMoney } from "../../shared/money";
import { LoadingText } from "../../shared/LoadingText";

type Site = { id: number; site_name: string; client_name: string };
type Person = { id: number; full_name: string };
type Row = Record<string, string | number | boolean>;

const paths: Record<string, string> = {
  time: "/api/v1/portal/time",
  requests: "/api/v1/portal/manpower-requests",
  evaluations: "/api/v1/portal/evaluations",
  incidents: "/api/v1/portal/incidents",
  bills: "/api/v1/portal/bills",
  documents: "/api/v1/portal/documents",
  summary: "/api/v1/portal/summary",
  users: "/api/v1/portal/account-users",
  notices: "/api/v1/portal/notices",
  activity: "/api/v1/portal/activity",
  leave: "/api/v1/portal/leave-requests",
};

export function PortalHrTab(props: { tab: string }) {
  const [note, setNote] = createSignal("");
  const [sites] = createResource(async () => (await portalFetch<Site[]>("/api/v1/portal/sites")).data ?? []);
  const [people] = createResource(async () => (await portalFetch<Person[]>("/api/v1/portal/people")).data ?? []);
  const [rows, { refetch }] = createResource(
    () => props.tab,
    async (tab) => {
      const res = await portalFetch<Row[] | Row>(paths[tab]);
      if (!res.ok) throw new Error(res.message ?? "Failed to load data.");
      return res.data;
    },
  );

  const send = async (path: string, body: Record<string, unknown>) => {
    const res = await portalFetch(path, { method: "POST", body: JSON.stringify(body) });
    setNote(res.ok ? "Saved." : res.message ?? "Could not save.");
    if (res.ok) void refetch();
  };

  return (
    <div class="space-y-4">
      <Show when={note()}><p class="text-sm text-text-secondary">{note()}</p></Show>
      <Show when={rows.loading}><LoadingText class="text-sm text-text-secondary" as="p" /></Show>
      <Show when={rows.error}><p class="text-sm text-red-600">{(rows.error as Error).message}</p></Show>
      <Show when={props.tab === "time"}>
        <TimeForm sites={sites() ?? []} onSubmit={(body) => void send("/api/v1/portal/time", body)} />
      </Show>
      <Show when={props.tab === "requests"}>
        <RequestForm sites={sites() ?? []} onSubmit={(body) => void send("/api/v1/portal/manpower-requests", body)} />
      </Show>
      <Show when={props.tab === "incidents"}>
        <IncidentForm people={people() ?? []} onSubmit={(body) => void send("/api/v1/portal/incidents", body)} />
      </Show>
      <Show when={!rows.loading && !rows.error && props.tab === "summary"}>
        <Summary data={rows() as Row} />
      </Show>
      <Show when={!rows.loading && !rows.error && props.tab !== "summary"}>
        <Table tab={props.tab} rows={(Array.isArray(rows()) ? rows() : []) as Row[]} onDecision={(id, decision) => void send(`/api/v1/portal/leave-requests/${id}/decision`, { decision })} />
      </Show>
    </div>
  );
}

function TimeForm(props: { sites: Site[]; onSubmit: (body: Record<string, unknown>) => void }) {
  const [siteId, setSiteId] = createSignal("");
  const [start, setStart] = createSignal("");
  const [end, setEnd] = createSignal("");
  const [fileName, setFileName] = createSignal("");
  return (
    <form class="grid gap-2 rounded-lg border border-stroke bg-white p-4 md:grid-cols-4" onSubmit={(e) => { e.preventDefault(); props.onSubmit({ site_id: Number(siteId()), period_start: start(), period_end: end(), file_name: fileName() }); }}>
      <SiteSelect sites={props.sites} value={siteId()} onChange={setSiteId} />
      <input class="h-9 rounded-lg border border-stroke px-2 text-sm" type="date" value={start()} onInput={(e) => setStart(e.currentTarget.value)} />
      <input class="h-9 rounded-lg border border-stroke px-2 text-sm" type="date" value={end()} onInput={(e) => setEnd(e.currentTarget.value)} />
      <input class="h-9 rounded-lg border border-stroke px-2 text-sm" placeholder="File name" value={fileName()} onInput={(e) => setFileName(e.currentTarget.value)} />
      <button type="submit" class="h-9 rounded-lg bg-brand-700 px-3 text-sm font-semibold text-white">Send time file</button>
    </form>
  );
}

function RequestForm(props: { sites: Site[]; onSubmit: (body: Record<string, unknown>) => void }) {
  const [siteId, setSiteId] = createSignal("");
  const [head, setHead] = createSignal("1");
  const [details, setDetails] = createSignal("");
  return (
    <form class="grid gap-2 rounded-lg border border-stroke bg-white p-4 md:grid-cols-4" onSubmit={(e) => { e.preventDefault(); props.onSubmit({ site_id: Number(siteId()), headcount: Number(head()) || 1, details: details() }); }}>
      <SiteSelect sites={props.sites} value={siteId()} onChange={setSiteId} />
      <input class="h-9 rounded-lg border border-stroke px-2 text-sm" value={head()} onInput={(e) => setHead(e.currentTarget.value)} />
      <input class="h-9 rounded-lg border border-stroke px-2 text-sm" placeholder="Details" value={details()} onInput={(e) => setDetails(e.currentTarget.value)} />
      <button type="submit" class="h-9 rounded-lg bg-brand-700 px-3 text-sm font-semibold text-white">Request people</button>
    </form>
  );
}

function IncidentForm(props: { people: Person[]; onSubmit: (body: Record<string, unknown>) => void }) {
  const [employeeId, setEmployeeId] = createSignal("");
  const [description, setDescription] = createSignal("");
  return (
    <form class="grid gap-2 rounded-lg border border-stroke bg-white p-4 md:grid-cols-3" onSubmit={(e) => { e.preventDefault(); props.onSubmit({ employee_id: Number(employeeId()), description: description() }); }}>
      <select class="h-9 rounded-lg border border-stroke px-2 text-sm" value={employeeId()} onChange={(e) => setEmployeeId(e.currentTarget.value)}>
        <option value="">Person</option>
        <For each={props.people}>{(person) => <option value={person.id}>{person.full_name}</option>}</For>
      </select>
      <input class="h-9 rounded-lg border border-stroke px-2 text-sm" placeholder="What happened" value={description()} onInput={(e) => setDescription(e.currentTarget.value)} />
      <button type="submit" class="h-9 rounded-lg bg-brand-700 px-3 text-sm font-semibold text-white">Report incident</button>
    </form>
  );
}

function SiteSelect(props: { sites: Site[]; value: string; onChange: (value: string) => void }) {
  return (
    <select class="h-9 rounded-lg border border-stroke px-2 text-sm" value={props.value} onChange={(e) => props.onChange(e.currentTarget.value)}>
      <option value="">Site</option>
      <For each={props.sites}>{(site) => <option value={site.id}>{site.client_name} · {site.site_name}</option>}</For>
    </select>
  );
}

function Summary(props: { data: Row | undefined }) {
  const data = () => props.data ?? {};
  return (
    <div class="grid gap-4 sm:grid-cols-3">
      <Card label="People on site" value={data().people} />
      <Card label="Open requests" value={data().open_requests} />
      <Card label="Bills" value={data().bills} />
    </div>
  );
}

function Card(props: { label: string; value: string | number | boolean | undefined }) {
  return (
    <div class="rounded-lg border border-stroke bg-white px-4 py-3.5">
      <p class="text-2xl font-bold tabular-nums">{props.value ?? "—"}</p>
      <p class="text-sm text-text-secondary">{props.label}</p>
    </div>
  );
}

function Table(props: { tab: string; rows: Row[]; onDecision: (id: number, decision: string) => void }) {
  const columns: Record<string, string[]> = {
    time: ["site_name", "period_start", "period_end", "status", "file_name", "accepted_hours"],
    requests: ["site_name", "headcount", "details", "status"],
    evaluations: ["employee_name", "overall_score"],
    incidents: ["employee_name", "description", "status"],
    bills: ["site_name", "period_start", "period_end", "total"],
    documents: ["title", "expires_on"],
    users: ["display_name", "email", "is_active"],
    notices: ["title", "created_at"],
    activity: ["display_name", "action", "created_at"],
    leave: ["employee_name", "date_from", "date_to", "days", "status", "client_decision"],
  };
  const keys = columns[props.tab] ?? [];
  return (
    <div class="overflow-hidden rounded-lg border border-stroke bg-white">
      <table class="min-w-full text-sm">
        <thead class="bg-surface text-left text-xs uppercase tracking-wide text-text-secondary">
          <tr>
            <For each={keys}>{(key) => <th class="px-4 py-3">{key.replace(/_/g, " ")}</th>}</For>
            <Show when={props.tab === "leave"}><th class="px-4 py-3">Decision</th></Show>
          </tr>
        </thead>
        <tbody>
          <For each={props.rows} fallback={<tr><td class="px-4 py-3 text-text-secondary" colspan={keys.length + 1}>Nothing here yet.</td></tr>}>
            {(row) => (
              <tr class="border-t border-stroke/60">
                <For each={keys}>
                  {(key) => <td class="px-4 py-3">{key === "total" ? formatMoney(Number(row[key] ?? 0)) : String(row[key] ?? "")}</td>}
                </For>
                <Show when={props.tab === "leave"}>
                  <td class="px-4 py-3">
                    <button type="button" class="mr-2 text-brand-700" onClick={() => props.onDecision(Number(row.id), "accepted")}>Accept</button>
                    <button type="button" class="text-text-secondary" onClick={() => props.onDecision(Number(row.id), "refused")}>Refuse</button>
                  </td>
                </Show>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}
