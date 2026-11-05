import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { Field, inputClass, SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";
import { HrBadge, HrPageHead, type HrBadgeTone } from "./HrUi";
import { siteChoices } from "./siteChoices";

type RequestRow = { id: number; client_name: string; site_name: string; headcount: number; details: string; status: string };
type StatusChip = "" | "open" | "filled" | "closed";

function mrTone(status: string): HrBadgeTone {
  const s = status.toLowerCase();
  if (s === "open") return "warning";
  if (s === "filled") return "success";
  if (s === "closed") return "neutral";
  if (s === "urgent") return "danger";
  return "info";
}

function labelize(status: string) {
  if (!status) return "—";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function ManpowerRequestsPage() {
  const toast = useToast();
  const [siteId, setSiteId] = createSignal("");
  const [headcount, setHeadcount] = createSignal("1");
  const [details, setDetails] = createSignal("");
  const [selected, setSelected] = createSignal<number | null>(null);
  const [statusFilter, setStatusFilter] = createSignal<StatusChip>("");
  const [search, setSearch] = createSignal("");
  const [modalOpen, setModalOpen] = createSignal(false);
  const [sites] = createResource(siteChoices);
  const [rows, { refetch }] = createResource(async () => (await apiFetch<RequestRow[]>("/api/v1/hr/manpower-requests")).data ?? []);

  const filtered = createMemo(() => {
    const chip = statusFilter();
    const q = search().trim().toLowerCase();
    return (rows() ?? []).filter((row) => {
      if (chip && row.status !== chip) return false;
      if (!q) return true;
      return (
        row.client_name.toLowerCase().includes(q) ||
        row.site_name.toLowerCase().includes(q) ||
        row.details.toLowerCase().includes(q) ||
        row.status.toLowerCase().includes(q)
      );
    });
  });

  const save = async () => {
    if (!siteId()) return toast.warning("Choose a site.");
    const res = await apiFetch("/api/v1/hr/manpower-requests", {
      method: "POST",
      body: JSON.stringify({ site_id: Number(siteId()), headcount: Number(headcount()) || 1, details: details() }),
    });
    if (!res.success) return toast.warning(res.message ?? "Could not save the request.");
    setDetails("");
    setModalOpen(false);
    void refetch();
    toast.success("Request saved.");
  };

  const setStatus = async (row: RequestRow, status: string) => {
    const res = await apiFetch(`/api/v1/hr/manpower-requests/${row.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    if (!res.success) return toast.warning(res.message ?? "Could not update the request.");
    void refetch();
  };

  const publishOpening = async (row: RequestRow) => {
    const title = window.prompt("Opening title", row.details || "Open role")?.trim();
    if (title === undefined) return;
    const res = await apiFetch(`/api/v1/hr/manpower-requests/${row.id}/publish-opening`, {
      method: "POST",
      body: JSON.stringify({ title: title || row.details || "Open role" }),
    });
    if (!res.success) return toast.warning(res.message ?? "Could not publish opening.");
    toast.success("Opening published on Contracts → Public openings.");
    void refetch();
  };

  return (
    <HrLayout>
      <HrPageHead
        title={
          <>
            Manpower requests
          </>
        }
        subtitle="Headcount requests from a client or from HR. Filling a request does not hire anyone."
        actions={
          <button type="button" class="hr-btn hr-btn-primary" onClick={() => setModalOpen(true)}>
            + New request
          </button>
        }
      />


      <SpreadsheetGrid
        columns={[
          { key: "client_name", header: "Client" },
          { key: "site_name", header: "Site / position" },
          {
            key: "filled",
            header: "Filled",
            sortable: false,
            render: (row) => (
              <span class="inline-flex items-center gap-2">
                <span class="hr-prog">
                  <i style={{ width: row.status === "filled" ? "100%" : "0%" }} />
                </span>
                <span class="hr-muted tabular-nums">
                  {row.status === "filled" ? row.headcount : 0}/{row.headcount}
                </span>
              </span>
            ),
            exportValue: (row) => `${row.status === "filled" ? row.headcount : 0}/${row.headcount}`,
          },
          { key: "headcount", header: "Slots" },
          { key: "details", header: "Details" },
          {
            key: "age",
            header: "Age",
            sortable: false,
            render: () => (
              <span class="hr-muted">
                —
              </span>
            ),
            exportValue: () => "",
          },
          {
            key: "status",
            header: "Status",
            render: (row) => (
              <div class="flex flex-wrap items-center gap-2">
                <HrBadge tone={mrTone(row.status)}>{labelize(row.status)}</HrBadge>
                <select
                  class="rounded border border-stroke bg-surface px-1 text-xs"
                  aria-label={`Change status for ${row.client_name}`}
                  value={row.status}
                  onChange={(e) => void setStatus(row, e.currentTarget.value)}
                >
                  <option value="open">open</option>
                  <option value="filled">filled</option>
                  <option value="closed">closed</option>
                </select>
              </div>
            ),
            exportValue: (row) => row.status,
          },
          {
            key: "actions",
            header: "Actions",
            sortable: false,
            hideable: false,
            render: (row) => (
              <details class="hr-menu hr-rowmenu">
                <summary class="hr-rowmenu-btn" aria-label="Row actions">
                  ⋯
                </summary>
                <div>
                  <button type="button" class="menu-item" onClick={() => setSelected(row.id)}>
                    Open
                  </button>
                  <button
                    type="button"
                    class="menu-item"
                    onClick={() => toast.warning("Applicant shortlist needs backend.")}
                  >
                    Shortlist
                  </button>
                  <button type="button" class="menu-item" onClick={() => void publishOpening(row)}>
                    Publish opening
                  </button>
                  <Show when={row.status === "open"}>
                    <button type="button" class="menu-item" onClick={() => void setStatus(row, "filled")}>
                      Mark filled
                    </button>
                    <button type="button" class="menu-item" onClick={() => void setStatus(row, "closed")}>
                      Close
                    </button>
                  </Show>
                </div>
              </details>
            ),
          },
        ]}
        rows={filtered()}
        loading={rows.loading}
        selectedId={selected()}
        onSelect={setSelected}
        onEdit={(row) => setSelected(row.id)}
        onNew={() => setModalOpen(true)}
        showNew={false}
        hideExport
        codeKey="client_name"
        nameKey="site_name"
        search={search()}
        onSearchChange={setSearch}
        searchPlaceholder="Search…"
        toolbarExtra={
          <div class="hr-seg" role="group" aria-label="Status filter">
            <For
              each={
                [
                  ["", "All"],
                  ["open", "Open"],
                  ["filled", "Filled"],
                  ["closed", "Closed"],
                ] as [StatusChip, string][]
              }
            >
              {([value, label]) => (
                <button type="button" classList={{ on: statusFilter() === value }} onClick={() => setStatusFilter(value)}>
                  {label}
                </button>
              )}
            </For>
          </div>
        }
      />

      <Show when={modalOpen()}>
        <div
          class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="New manpower request"
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "Escape") setModalOpen(false);
          }}
        >
          <div class="w-full max-w-md rounded-lg border border-stroke bg-surface p-4 shadow-lg">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold">New manpower request</h2>
              <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setModalOpen(false)}>
                ✕
              </button>
            </div>
            <div class="grid gap-3">
              <Field label="Site">
                <select class={inputClass} value={siteId()} onChange={(e) => setSiteId(e.currentTarget.value)}>
                  <option value="">Choose</option>
                  <For each={sites() ?? []}>{(site) => <option value={site.id}>{site.client_name} · {site.site_name}</option>}</For>
                </select>
              </Field>
              <Field label="Headcount">
                <input class={inputClass} value={headcount()} onInput={(e) => setHeadcount(e.currentTarget.value)} />
              </Field>
              <Field label="Details / position">
                <input class={inputClass} value={details()} onInput={(e) => setDetails(e.currentTarget.value)} />
              </Field>
              <div class="rounded-lg border border-dashed border-stroke bg-panel p-3 text-sm">
                <b>Needed-by date / urgency</b>
              </div>
            </div>
            <div class="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" class="hr-btn" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button type="button" class="hr-btn hr-btn-primary" onClick={() => void save()}>
                Save
              </button>
            </div>
          </div>
        </div>
      </Show>
    </HrLayout>
  );
}
