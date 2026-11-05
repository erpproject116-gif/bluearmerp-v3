import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { apiBase, apiFetch, getAccessToken } from "../../shared/api";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";
import { HrAttendanceTabs } from "./HrAttendanceTabs";
import { HrBadge, HrEmpty, HrNotice, HrPageHead, HrPlanned, HrTcard, type HrBadgeTone } from "./HrUi";
import { siteChoices } from "./siteChoices";

type Submission = {
  id: number;
  client_name: string;
  site_name: string;
  period_start: string;
  period_end: string;
  status: string;
  file_name: string;
  accepted_hours: number;
};

function statusTone(status: string): HrBadgeTone {
  switch ((status || "").toLowerCase()) {
    case "accepted":
      return "success";
    case "returned":
      return "warning";
    case "late":
      return "danger";
    case "submitted":
    case "pending":
      return "info";
    case "not_submitted":
    case "not submitted":
      return "neutral";
    default:
      return "neutral";
  }
}

function statusLabel(status: string): string {
  if (!status) return "—";
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ClientDtrPage() {
  const toast = useToast();
  const [siteId, setSiteId] = createSignal("");
  const [start, setStart] = createSignal("");
  const [end, setEnd] = createSignal("");
  const [file, setFile] = createSignal<File | null>(null);
  const [hours, setHours] = createSignal<Record<number, string>>({});
  const [search, setSearch] = createSignal("");
  const [statusSeg, setStatusSeg] = createSignal("");
  const [clientFilter, setClientFilter] = createSignal("");
  const [sites] = createResource(siteChoices);
  const [rows, { refetch }] = createResource(async () => (await apiFetch<Submission[]>("/api/v1/hr/client-time")).data ?? []);

  const clients = createMemo(() => {
    const set = new Set<string>();
    for (const r of rows() ?? []) if (r.client_name) set.add(r.client_name);
    return [...set].sort((a, b) => a.localeCompare(b));
  });

  const counts = createMemo(() => {
    const list = rows() ?? [];
    const by = (pred: (s: string) => boolean) => list.filter((r) => pred((r.status || "").toLowerCase())).length;
    return {
      total: list.length,
      submitted: by((s) => s === "submitted" || s === "pending"),
      accepted: by((s) => s === "accepted"),
      returned: by((s) => s === "returned"),
      other: by((s) => !["submitted", "pending", "accepted", "returned"].includes(s)),
    };
  });

  const filtered = createMemo(() => {
    const qq = search().trim().toLowerCase();
    const st = statusSeg().toLowerCase();
    const cl = clientFilter();
    return (rows() ?? []).filter((row) => {
      if (cl && row.client_name !== cl) return false;
      if (st && (row.status || "").toLowerCase() !== st) return false;
      if (!qq) return true;
      return (
        row.client_name.toLowerCase().includes(qq) ||
        row.site_name.toLowerCase().includes(qq) ||
        (row.file_name || "").toLowerCase().includes(qq)
      );
    });
  });

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
    toast.success("Submission saved.");
    void refetch();
  };

  const accept = async (row: Submission) => {
    const res = await apiFetch(`/api/v1/hr/client-time/${row.id}/accept`, {
      method: "POST",
      body: JSON.stringify({ accepted_hours: Number(hours()[row.id] ?? row.accepted_hours) || 0 }),
    });
    if (!res.success) return toast.warning(res.message ?? "Could not accept the submission.");
    toast.success("Accepted.");
    void refetch();
  };

  return (
    <HrLayout>
      <div class="hr-crumb">HR &amp; Payroll › Time &amp; leave › Attendance / DTR › Client DTR inbox</div>
      <HrAttendanceTabs />
      <HrPageHead
        title={
          <>
            Client DTR inbox <HrPlanned />
          </>
        }
        subtitle="DTR submitted by client users per cut-off. Review, accept or return, then lock and push to payroll."
        actions={
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="hr-btn"
              onClick={() => toast.info("Send reminders — Planned (needs client portal recipients).")}
            >
              Send reminders… <HrPlanned />
            </button>
            <button
              type="button"
              class="hr-btn hr-btn-primary"
              onClick={() => toast.info("Lock cut-off & push to payroll — Planned.")}
            >
              Lock cut-off &amp; push… <HrPlanned />
            </button>
          </div>
        }
      />

      <HrNotice>
        <b>Planned page</b> for full submission inbox (versions, receipts, return, lock). Today you can record a site
        submission and accept hours — accepted hours stay here and are not written into attendance.
      </HrNotice>

      <div class="hr-kpis mt-3 mb-3">
        <a class="hr-kpi" href="#inbox">
          <div class="v">{rows() ? counts().total : "—"}</div>
          <div class="l">Submissions</div>
        </a>
        <a class="hr-kpi" href="#inbox">
          <div class="v">{rows() ? counts().submitted : "—"}</div>
          <div class="l">Submitted / pending</div>
        </a>
        <a class="hr-kpi warn" href="#inbox">
          <div class="v">{rows() ? counts().returned : "—"}</div>
          <div class="l">
            Returned <HrPlanned />
          </div>
        </a>
        <a class="hr-kpi" href="#inbox">
          <div class="v">{rows() ? counts().accepted : "—"}</div>
          <div class="l">Accepted</div>
        </a>
      </div>

      <section class="mb-4 grid gap-3 rounded-xl border border-stroke bg-surface p-4 grid-cols-1 min-[1024px]:grid-cols-2">
        <Field label="Site">
          <select class={inputClass} value={siteId()} onChange={(e) => setSiteId(e.currentTarget.value)}>
            <option value="">Choose</option>
            <For each={sites() ?? []}>
              {(site) => (
                <option value={site.id}>
                  {site.client_name} · {site.site_name}
                </option>
              )}
            </For>
          </select>
        </Field>
        <Field label="Period start">
          <input type="date" class={inputClass} value={start()} onInput={(e) => setStart(e.currentTarget.value)} />
        </Field>
        <Field label="Period end">
          <input type="date" class={inputClass} value={end()} onInput={(e) => setEnd(e.currentTarget.value)} />
        </Field>
        <Field label="File">
          <input type="file" class={inputClass} onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)} />
        </Field>
        <button type="button" class="hr-btn hr-btn-primary self-end" onClick={() => void save()}>
          Save submission
        </button>
      </section>

      <div id="inbox">
        <HrTcard
          toolbar={
            <>
              <input
                class={`${inputClass} grow`}
                placeholder="Search client or branch…"
                aria-label="Search"
                value={search()}
                onInput={(e) => setSearch(e.currentTarget.value)}
              />
              <div class="hr-seg" role="group" aria-label="Status">
                <button type="button" classList={{ on: statusSeg() === "" }} onClick={() => setStatusSeg("")}>
                  All
                </button>
                <button type="button" classList={{ on: statusSeg() === "submitted" }} onClick={() => setStatusSeg("submitted")}>
                  Submitted
                </button>
                <button type="button" classList={{ on: statusSeg() === "accepted" }} onClick={() => setStatusSeg("accepted")}>
                  Accepted
                </button>
                <button
                  type="button"
                  classList={{ on: statusSeg() === "returned" }}
                  onClick={() => setStatusSeg("returned")}
                  title="Needs backend status"
                >
                  Returned <HrPlanned />
                </button>
              </div>
              <select
                class={inputClass}
                aria-label="Client"
                value={clientFilter()}
                onChange={(e) => setClientFilter(e.currentTarget.value)}
              >
                <option value="">Client: All</option>
                <For each={clients()}>{(c) => <option value={c}>{c}</option>}</For>
              </select>
            </>
          }
        >
          <div class="hr-tbl-wrap">
            <Show
              when={filtered().length > 0}
              fallback={
                <HrEmpty
                  title={rows.loading ? "Loading…" : "No submissions"}
                  hint="Save a site submission above, or clear filters."
                />
              }
            >
              <table class="hr-tbl">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Branch / site</th>
                    <th>Period</th>
                    <th>File</th>
                    <th>
                      Version <HrPlanned />
                    </th>
                    <th>Status</th>
                    <th>Accepted hours</th>
                    <th>
                      <span class="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <For each={filtered()}>
                    {(row) => (
                      <tr>
                        <td>{row.client_name}</td>
                        <td>{row.site_name}</td>
                        <td>
                          {row.period_start} → {row.period_end}
                        </td>
                        <td>{row.file_name || "—"}</td>
                        <td>—</td>
                        <td>
                          <HrBadge tone={statusTone(row.status)}>{statusLabel(row.status)}</HrBadge>
                        </td>
                        <td>
                          <Show
                            when={row.status === "accepted"}
                            fallback={
                              <span class="flex flex-wrap items-center gap-2">
                                <input
                                  class={inputClass}
                                  style={{ width: "5.5rem" }}
                                  value={hours()[row.id] ?? ""}
                                  onInput={(e) => setHours({ ...hours(), [row.id]: e.currentTarget.value })}
                                  aria-label="Accepted hours"
                                />
                                <button type="button" class="hr-btn hr-btn-sm hr-btn-primary" onClick={() => void accept(row)}>
                                  Accept
                                </button>
                              </span>
                            }
                          >
                            <span class="tabular-nums">{row.accepted_hours}</span>
                          </Show>
                        </td>
                        <td>
                          <button
                            type="button"
                            class="hr-btn hr-btn-sm"
                            onClick={() => toast.info("Review / return / version history — Planned.")}
                          >
                            Review <HrPlanned />
                          </button>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </Show>
          </div>
        </HrTcard>
      </div>
    </HrLayout>
  );
}
