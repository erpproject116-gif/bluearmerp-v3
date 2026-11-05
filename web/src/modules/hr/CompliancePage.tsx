import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";
import { HrReportsTabs } from "./HrReportsTabs";
import { HrBadge, HrEmpty, HrNotice, HrPageHead, HrTcard, type HrBadgeTone } from "./HrUi";

type Doc = {
  id: number;
  employee_name: string;
  doc_type: string;
  title: string;
  expires_on: string;
  late: boolean;
  client_visible?: boolean;
};

type DocStatus = "Expiring" | "Expired" | "Missing" | "Valid";

function daysUntil(iso: string) {
  if (!iso) return null;
  const t = Date.parse(iso.slice(0, 10));
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / 86400000);
}

function docStatus(row: Doc): DocStatus {
  if (!row.expires_on) return "Missing";
  if (row.late) return "Expired";
  const d = daysUntil(row.expires_on);
  if (d != null && d <= 30) return "Expiring";
  return "Valid";
}

function statusTone(status: DocStatus): HrBadgeTone {
  if (status === "Expired" || status === "Missing") return "danger";
  if (status === "Expiring") return "warning";
  return "success";
}

function formatExpiry(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export default function CompliancePage() {
  const toast = useToast();
  const [panel, setPanel] = createSignal<"d" | "r">("d");
  const [search, setSearch] = createSignal("");
  const [statusSeg, setStatusSeg] = createSignal<"" | DocStatus>("");
  const [dates, setDates] = createSignal<Record<number, string>>({});
  const [upOpen, setUpOpen] = createSignal(false);
  const [upTarget, setUpTarget] = createSignal<Doc | null>(null);
  const [upExpiry, setUpExpiry] = createSignal("");

  const [rows, { refetch }] = createResource(async () => (await apiFetch<Doc[]>("/api/v1/hr/compliance-documents")).data ?? []);

  const kpis = createMemo(() => {
    const list = rows() ?? [];
    let expiring = 0;
    let expired = 0;
    let missing = 0;
    for (const row of list) {
      const s = docStatus(row);
      if (s === "Expiring") expiring += 1;
      else if (s === "Expired") expired += 1;
      else if (s === "Missing") missing += 1;
    }
    return { expiring, expired, missing };
  });

  const filtered = createMemo(() => {
    const q = search().trim().toLowerCase();
    return (rows() ?? []).filter((row) => {
      const status = docStatus(row);
      if (statusSeg() && status !== statusSeg()) return false;
      if (!q) return true;
      return (
        row.employee_name.toLowerCase().includes(q) ||
        (row.doc_type || "").toLowerCase().includes(q) ||
        (row.title || "").toLowerCase().includes(q)
      );
    });
  });

  const saveExpiry = async (row: Doc) => {
    const res = await apiFetch(`/api/v1/hr/employee-documents/${row.id}/expiry`, {
      method: "PATCH",
      body: JSON.stringify({ expires_on: dates()[row.id] ?? row.expires_on }),
    });
    if (!res.success) return toast.warning(res.message ?? "Could not save the expiry.");
    toast.success("Expiry saved.");
    void refetch();
  };

  const showToClient = async (row: Doc) => {
    const res = await apiFetch(`/api/v1/hr/employee-documents/${row.id}/visibility`, {
      method: "PATCH",
      body: JSON.stringify({ client_visible: !row.client_visible }),
    });
    if (!res.success) return toast.warning(res.message ?? "Could not update visibility.");
    toast.success(row.client_visible ? "Hidden from client." : "Visible to client.");
    void refetch();
  };

  const saveUploadExpiry = async () => {
    const row = upTarget();
    if (!row) return;
    if (!upExpiry()) return toast.warning("Expiry date is required.");
    setDates({ ...dates(), [row.id]: upExpiry() });
    const res = await apiFetch(`/api/v1/hr/employee-documents/${row.id}/expiry`, {
      method: "PATCH",
      body: JSON.stringify({ expires_on: upExpiry() }),
    });
    if (!res.success) return toast.warning(res.message ?? "Could not save the expiry.");
    toast.success("Expiry updated. File replace needs document upload on the employee file.");
    setUpOpen(false);
    void refetch();
  };

  return (
    <HrLayout>
      <HrReportsTabs />
      <HrPageHead
        title={
          <>
            Compliance &amp; documents
          </>
        }
        subtitle="Document expiry, 201-file completeness and DOLE checks."
        actions={
          <button
            type="button"
            class="hr-btn"
            disabled
            title="Needs backend"
            onClick={() => toast.warning("Reminders need backend.")}
          >
            Send reminders
          </button>
        }
      />


      <div class="hr-kpis mt-3 mb-3">
        <a
          class="hr-kpi warn"
          href="#docs"
          classList={{ zero: !rows.loading && kpis().expiring === 0 }}
          onClick={() => {
            setPanel("d");
            setStatusSeg("Expiring");
          }}
        >
          <div class="v">{rows.loading ? "—" : kpis().expiring}</div>
          <div class="l">Expiring ≤30 days</div>
        </a>
        <a
          class="hr-kpi alert"
          href="#docs"
          classList={{ zero: !rows.loading && kpis().expired === 0 }}
          onClick={() => {
            setPanel("d");
            setStatusSeg("Expired");
          }}
        >
          <div class="v">{rows.loading ? "—" : kpis().expired}</div>
          <div class="l">Expired</div>
        </a>
        <a
          class="hr-kpi"
          href="#docs"
          classList={{ zero: !rows.loading && kpis().missing === 0 }}
          onClick={() => {
            setPanel("d");
            setStatusSeg("Missing");
          }}
        >
          <div class="v">{rows.loading ? "—" : kpis().missing}</div>
          <div class="l">Missing</div>
        </a>
        <a
          class="hr-kpi warn"
          href="#dole"
          title="Needs hire-date / regularization backend"
          onClick={() => setPanel("r")}
        >
          <div class="v">—</div>
          <div class="l">
            Near 6-month mark
          </div>
          <div class="h">Regularization check</div>
        </a>
      </div>

      <div data-tabroot id="docs">
        <div class="hr-seg mb-3" role="tablist" aria-label="Compliance panels">
          <button type="button" role="tab" classList={{ on: panel() === "d" }} aria-selected={panel() === "d"} onClick={() => setPanel("d")}>
            Documents
          </button>
          <button type="button" role="tab" classList={{ on: panel() === "r" }} aria-selected={panel() === "r"} onClick={() => setPanel("r")}>
            DOLE checks
          </button>
        </div>

        <Show when={panel() === "d"}>
          <HrTcard
            toolbar={
              <>
                <input
                  class="grow rounded-lg border border-stroke bg-surface px-3 py-2 text-sm"
                  placeholder="Search…"
                  aria-label="Search"
                  value={search()}
                  onInput={(e) => setSearch(e.currentTarget.value)}
                />
                <div class="hr-seg" role="group" aria-label="Status">
                  <button type="button" classList={{ on: statusSeg() === "" }} onClick={() => setStatusSeg("")}>
                    All
                  </button>
                  <button type="button" classList={{ on: statusSeg() === "Expiring" }} onClick={() => setStatusSeg("Expiring")}>
                    Expiring
                  </button>
                  <button type="button" classList={{ on: statusSeg() === "Expired" }} onClick={() => setStatusSeg("Expired")}>
                    Expired
                  </button>
                  <button type="button" classList={{ on: statusSeg() === "Missing" }} onClick={() => setStatusSeg("Missing")}>
                    Missing
                  </button>
                  <button type="button" classList={{ on: statusSeg() === "Valid" }} onClick={() => setStatusSeg("Valid")}>
                    Valid
                  </button>
                </div>
              </>
            }
          >
            <div class="hr-tbl-wrap">
              <table class="hr-tbl">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Document</th>
                    <th>Expires</th>
                    <th>Status</th>
                    <th>Client</th>
                    <th>
                      <span class="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <Show when={rows.loading}>
                    <tr>
                      <td colspan="6" class="hr-muted">
                        Loading…
                      </td>
                    </tr>
                  </Show>
                  <Show when={!rows.loading}>
                    <For
                      each={filtered()}
                      fallback={
                        <tr>
                          <td colspan="6">
                            <HrEmpty title="No matches" hint="Try a different search or clear the filters." />
                          </td>
                        </tr>
                      }
                    >
                      {(row) => {
                        const status = () => docStatus(row);
                        return (
                          <tr>
                            <td>{row.employee_name}</td>
                            <td>
                              <div class="font-semibold">{row.title || row.doc_type}</div>
                              <Show when={row.title && row.doc_type}>
                                <div class="hr-muted text-xs">{row.doc_type}</div>
                              </Show>
                            </td>
                            <td>
                              <span class="flex flex-wrap items-center gap-2">
                                <input
                                  type="date"
                                  class={`${inputClass} !min-h-[30px] !py-1`}
                                  value={dates()[row.id] ?? row.expires_on ?? ""}
                                  onInput={(e) => setDates({ ...dates(), [row.id]: e.currentTarget.value })}
                                />
                                <button type="button" class="text-sm text-brand-700" onClick={() => void saveExpiry(row)}>
                                  Save
                                </button>
                              </span>
                              <div class="hr-muted text-xs">{formatExpiry(dates()[row.id] ?? row.expires_on)}</div>
                            </td>
                            <td>
                              <HrBadge tone={statusTone(status())}>{status()}</HrBadge>
                            </td>
                            <td>
                              <button type="button" class="text-sm text-brand-700" onClick={() => void showToClient(row)}>
                                {row.client_visible ? "Visible" : "Hidden"}
                              </button>
                            </td>
                            <td>
                              <details class="hr-menu hr-rowmenu">
                                <summary class="hr-rowmenu-btn" aria-label="Row actions">
                                  ⋯
                                </summary>
                                <div>
                                  <button
                                    type="button"
                                    class="menu-item"
                                    onClick={() => {
                                      setUpTarget(row);
                                      setUpExpiry(dates()[row.id] ?? row.expires_on ?? "");
                                      setUpOpen(true);
                                    }}
                                  >
                                    Upload / set expiry
                                  </button>
                                  <button type="button" class="menu-item" disabled title="Needs backend">
                                    Remind
                                  </button>
                                  <button type="button" class="menu-item" disabled title="Open on employee file">
                                    View
                                  </button>
                                </div>
                              </details>
                            </td>
                          </tr>
                        );
                      }}
                    </For>
                  </Show>
                </tbody>
              </table>
            </div>
            <div class="px-1 py-2 text-xs text-text-secondary">
              Showing {filtered().length} of {(rows() ?? []).length}
            </div>
          </HrTcard>
        </Show>

        <Show when={panel() === "r"}>
          <div id="dole" class="rounded-xl border border-stroke bg-surface p-4 text-sm shadow-sm">
            <HrNotice>
              <b>Needs backend:</b> DOLE / regularization flags from hire dates and contract patterns.
            </HrNotice>
            <ul class="mt-3 space-y-2">
              <li class="flex flex-wrap items-center justify-between gap-2">
                <span>Employees approaching 6 months of service (probationary → regular)</span>
                <span class="inline-flex items-center gap-1">
                  <HrBadge tone="neutral">—</HrBadge>
                </span>
              </li>
              <li class="flex flex-wrap items-center justify-between gap-2">
                <span>Contracts renewed back-to-back on the same role (“5-5-5” endo pattern)</span>
                <span class="inline-flex items-center gap-1">
                  <HrBadge tone="danger">flagged</HrBadge>
                </span>
              </li>
              <li class="flex flex-wrap items-center justify-between gap-2">
                <span>DO 174 registration certificate validity</span>
                <span class="inline-flex items-center gap-1">
                  <HrBadge tone="success">Valid</HrBadge>
                </span>
              </li>
            </ul>
            <p class="mt-3 text-xs text-text-secondary">Flags for HR review only; not legal advice.</p>
          </div>
        </Show>
      </div>

      <Show when={upOpen()}>
        <div
          class="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Upload compliance document"
        >
          <div class="w-full max-w-md rounded-lg border border-stroke bg-surface p-4 shadow-lg">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold">Upload compliance document</h2>
              <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setUpOpen(false)}>
                ✕
              </button>
            </div>
            <div class="grid gap-3">
              <Field label="Document">
                <input class={inputClass} value={upTarget()?.title || upTarget()?.doc_type || ""} disabled />
              </Field>
              <Field label="Employee">
                <input class={inputClass} value={upTarget()?.employee_name || ""} disabled />
              </Field>
              <Field label="File">
                <input type="file" class={inputClass} disabled title="Replace file on the employee record" />
                <p class="mt-1 text-xs text-text-secondary">
                  File replace is on the employee 201 file. Here you can update expiry.
                </p>
              </Field>
              <Field label="Expiry date">
                <input class={inputClass} type="date" value={upExpiry()} onInput={(e) => setUpExpiry(e.currentTarget.value)} />
              </Field>
            </div>
            <div class="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" class="hr-btn" onClick={() => setUpOpen(false)}>
                Cancel
              </button>
              <button type="button" class="hr-btn hr-btn-primary" onClick={() => void saveUploadExpiry()}>
                Save expiry
              </button>
            </div>
          </div>
        </div>
      </Show>
    </HrLayout>
  );
}
