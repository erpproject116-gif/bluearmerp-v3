import { createResource, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { HrBadge, HrEmpty, HrNotice } from "./HrUi";

type Assignment = {
  id: number;
  employee_id: number;
  employee_name?: string;
  client_name: string;
  site_id: number;
  site_name: string;
  start_date: string;
  end_date: string;
};

type Client = {
  id: number;
  name: string;
  sites: { id: number; site_name: string }[];
};

export function EmployeeAssignmentPanel(props: { employeeId: number }) {
  const toast = useToast();
  const [siteId, setSiteId] = createSignal("");
  const [startDate, setStartDate] = createSignal("");
  const [rows, { refetch }] = createResource(
    () => props.employeeId,
    async (employeeId) => {
      const res = await apiFetch<Assignment[]>("/api/v1/hr/assignments");
      return (res.data ?? []).filter((row) => row.employee_id === employeeId);
    },
  );
  const [clients] = createResource(async () => (await apiFetch<Client[]>("/api/v1/hr/clients")).data ?? []);
  const sites = () => (clients() ?? []).flatMap((c) => c.sites.map((s) => ({ ...s, client_name: c.name })));

  const place = async () => {
    if (!siteId() || !startDate()) return toast.warning("Choose a site and start date.");
    const res = await apiFetch("/api/v1/hr/assignments", {
      method: "POST",
      body: JSON.stringify({ employee_id: props.employeeId, site_id: Number(siteId()), start_date: startDate() }),
    });
    if (!res.success) return toast.warning(res.message ?? "Could not place the assignment.");
    toast.success("Assignment placed. Employment status is unchanged.");
    setSiteId("");
    setStartDate("");
    void refetch();
  };

  const end = async (id: number) => {
    const res = await apiFetch(`/api/v1/hr/assignments/${id}`, { method: "PATCH", body: JSON.stringify({}) });
    if (!res.success) return toast.warning(res.message ?? "Could not end the assignment.");
    toast.success("Assignment ended. Employment status is unchanged.");
    void refetch();
  };

  return (
    <div class="col-span-full space-y-4">
      <HrNotice>Client / site assignment uses the live deployments API. Ending an assignment does not change employment status.</HrNotice>
      <div class="grid grid-cols-1 gap-3 min-[1024px]:grid-cols-3">
        <Field label="Site">
          <select class={inputClass} value={siteId()} onChange={(e) => setSiteId(e.currentTarget.value)}>
            <option value="">Choose site…</option>
            <For each={sites()}>{(s) => <option value={s.id}>{s.client_name} · {s.site_name}</option>}</For>
          </select>
        </Field>
        <Field label="Start date">
          <input type="date" class={inputClass} value={startDate()} onInput={(e) => setStartDate(e.currentTarget.value)} />
        </Field>
        <div class="flex items-end">
          <button type="button" class="rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white" onClick={() => void place()}>
            Place on site
          </button>
        </div>
      </div>
      <p class="text-xs text-text-secondary">Branch score / fill rate</p>
      <div class="overflow-x-auto rounded-lg border border-stroke">
        <table class="min-w-full text-left text-sm">
          <thead>
            <tr class="border-b border-stroke text-text-secondary">
              <th class="px-3 py-2">Client / site</th>
              <th class="px-3 py-2">Start</th>
              <th class="px-3 py-2">End</th>
              <th class="px-3 py-2">Status</th>
              <th class="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            <For each={rows() ?? []} fallback={<tr><td colSpan={5}><HrEmpty title="No assignments yet" hint="Place this employee on a client site." /></td></tr>}>
              {(row) => (
                <tr class="border-t border-stroke">
                  <td class="px-3 py-2">{row.client_name} · {row.site_name}</td>
                  <td class="px-3 py-2">{row.start_date}</td>
                  <td class="px-3 py-2">{row.end_date || "—"}</td>
                  <td class="px-3 py-2">
                    <Show when={!row.end_date} fallback={<HrBadge tone="neutral">Ended</HrBadge>}>
                      <HrBadge tone="success">Active</HrBadge>
                    </Show>
                  </td>
                  <td class="px-3 py-2 text-right">
                    <Show when={!row.end_date}>
                      <button type="button" class="text-xs text-brand-700" onClick={() => void end(row.id)}>End</button>
                    </Show>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </div>
  );
}
