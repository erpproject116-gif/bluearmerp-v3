import { A } from "@solidjs/router";
import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { LookupCombo } from "../../shared/LookupCombo";
import { SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { fetchEmployeeOptions } from "../../shared/useHr";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";
import { HrBadge, HrEmpty, HrPageHead, type HrBadgeTone } from "./HrUi";

type Clearance = {
  id: number;
  employee_id: number;
  employee_name: string;
  employee_status: string;
  status: string;
  pay_period_id: number;
};

type StatusFilter = "" | "in_clearance" | "final_pay" | "released";

const STATUS_CHIPS: { value: StatusFilter; label: string; planned?: boolean }[] = [
  { value: "", label: "All" },
  { value: "in_clearance", label: "In clearance" },
  { value: "final_pay", label: "Final pay computing", planned: true },
  { value: "released", label: "Released" },
];

function clearanceLabel(status: string) {
  if (status === "released") return "Released";
  if (status === "pending") return "In clearance";
  return status.replaceAll("_", " ");
}

function clearanceTone(status: string): HrBadgeTone {
  if (status === "released") return "success";
  if (status === "pending") return "warning";
  return "neutral";
}

function employmentTone(status: string): HrBadgeTone {
  const s = status.toLowerCase();
  if (s === "active") return "success";
  if (s === "terminated" || s === "inactive") return "danger";
  return "neutral";
}

export default function OffboardingPage() {
  const toast = useToast();
  const [empId, setEmpId] = createSignal<number | null>(null);
  const [empLabel, setEmpLabel] = createSignal("");
  const [reason, setReason] = createSignal("Resignation");
  const [lastDay, setLastDay] = createSignal("");
  const [selected, setSelected] = createSignal<number | null>(null);
  const [statusFilter, setStatusFilter] = createSignal<StatusFilter>("");
  const [search, setSearch] = createSignal("");
  const [startOpen, setStartOpen] = createSignal(false);
  const [checklistOpen, setChecklistOpen] = createSignal(false);
  const [finalPayOpen, setFinalPayOpen] = createSignal(false);
  const [coeOpen, setCoeOpen] = createSignal(false);
  const [activeRow, setActiveRow] = createSignal<Clearance | null>(null);
  const [saving, setSaving] = createSignal(false);

  const [rows, { refetch }] = createResource(async () => (await apiFetch<Clearance[]>("/api/v1/hr/clearances")).data ?? []);

  const filtered = createMemo(() => {
    const q = search().trim().toLowerCase();
    const chip = statusFilter();
    return (rows() ?? []).filter((row) => {
      if (chip === "in_clearance" && row.status !== "pending") return false;
      if (chip === "released" && row.status !== "released") return false;
      if (chip === "final_pay") return false;
      if (!q) return true;
      return (
        row.employee_name.toLowerCase().includes(q) ||
        row.status.toLowerCase().includes(q) ||
        row.employee_status.toLowerCase().includes(q)
      );
    });
  });

  const selectedRow = createMemo(() => (rows() ?? []).find((row) => row.id === selected()) ?? null);

  const openStart = () => {
    setEmpId(null);
    setEmpLabel("");
    setReason("Resignation");
    setLastDay("");
    setStartOpen(true);
  };

  const save = async () => {
    if (!empId()) return toast.warning("Choose an employee.");
    setSaving(true);
    const res = await apiFetch("/api/v1/hr/clearances", {
      method: "POST",
      body: JSON.stringify({ employee_id: empId() }),
    });
    setSaving(false);
    if (!res.success) return toast.warning(res.message ?? "Could not save the clearance.");
    if (reason() || lastDay()) {
      toast.success("Clearance started.");
    } else {
      toast.success("Clearance started.");
    }
    setStartOpen(false);
    setEmpId(null);
    setEmpLabel("");
    void refetch();
  };

  const release = async (row: Clearance) => {
    if (row.status === "released") return;
    const res = await apiFetch(`/api/v1/hr/clearances/${row.id}/release`, { method: "POST", body: JSON.stringify({}) });
    if (!res.success) return toast.warning(res.message ?? "Could not release final pay.");
    toast.success("Final pay released.");
    void refetch();
  };

  const openFor = (row: Clearance, kind: "checklist" | "final" | "coe") => {
    setActiveRow(row);
    setSelected(row.id);
    if (kind === "checklist") setChecklistOpen(true);
    if (kind === "final") setFinalPayOpen(true);
    if (kind === "coe") setCoeOpen(true);
  };

  return (
    <HrLayout>
      <HrPageHead
        crumb={<>HR &amp; Payroll › People › Offboarding &amp; clearance</>}
        title={
          <>
            Offboarding &amp; clearance
          </>
        }
        subtitle="Clearance checklist, final pay and certificate of employment."
        actions={
          <div class="hr-actions">
            <A class="hr-btn" href="/app/hr/applicants">
              Applicants ↗
            </A>
            <A class="hr-btn" href="/app/hr/hire-onboarding">
              Onboarding ↗
            </A>
            <button type="button" class="hr-btn hr-btn-primary" onClick={openStart}>
              + Start offboarding
            </button>
          </div>
        }
      />


      <div class="hr-tcard-grid mt-3">
        <SpreadsheetGrid
          columns={[
            {
              key: "employee_name",
              header: "Employee",
              clickable: true,
              render: (row) => {
                const parts = row.employee_name.trim().split(/\s+/).filter(Boolean);
                const av =
                  parts.length === 0
                    ? "?"
                    : parts.length === 1
                      ? parts[0].slice(0, 2).toUpperCase()
                      : `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
                return (
                  <div class="hr-who">
                    <div class="hr-avatar" aria-hidden="true">{av}</div>
                    <b>{row.employee_name}</b>
                  </div>
                );
              },
            },
            {
              key: "reason",
              header: "Reason",
              sortable: false,
              render: () => (
                <span class="hr-muted">
                  —
                </span>
              ),
              exportValue: () => "",
            },
            {
              key: "last_day",
              header: "Last day",
              sortable: false,
              render: () => (
                <span class="hr-muted">
                  —
                </span>
              ),
              exportValue: () => "",
            },
            {
              key: "clearance_progress",
              header: "Clearance",
              sortable: false,
              render: (row) => (
                <span class="tabular-nums">{row.status === "released" ? "5 / 5" : "— / 5"}</span>
              ),
              exportValue: (row) => (row.status === "released" ? "5/5" : ""),
            },
            {
              key: "employee_status",
              header: "Employment",
              render: (row) => (
                <HrBadge tone={employmentTone(row.employee_status)}>
                  {row.employee_status.charAt(0).toUpperCase() + row.employee_status.slice(1)}
                </HrBadge>
              ),
              exportValue: (row) => row.employee_status,
            },
            {
              key: "status",
              header: "Status",
              render: (row) => <HrBadge tone={clearanceTone(row.status)}>{clearanceLabel(row.status)}</HrBadge>,
              exportValue: (row) => clearanceLabel(row.status),
            },
            {
              key: "actions",
              header: "Actions",
              sortable: false,
              hideable: false,
              render: (row) => (
                <details class="hr-menu hr-rowmenu">
                  <summary class="hr-rowmenu-btn" aria-label="Row actions">⋯</summary>
                  <div>
                    <button type="button" class="menu-item" onClick={() => openFor(row, "checklist")}>
                      Open checklist
                    </button>
                    <button type="button" class="menu-item" onClick={() => openFor(row, "final")}>
                      Compute final pay
                    </button>
                    <button type="button" class="menu-item" onClick={() => openFor(row, "coe")}>
                      Issue COE
                    </button>
                    <Show
                      when={row.status !== "released"}
                      fallback={<span class="menu-item hr-muted">Already released</span>}
                    >
                      <button type="button" class="menu-item" onClick={() => void release(row)}>
                        Release final pay
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
          onEdit={(row) => openFor(row, "checklist")}
          onNew={openStart}
          showNew={false}
          hideExport
          codeKey="employee_name"
          nameKey="status"
          search={search()}
          onSearchChange={setSearch}
          searchPlaceholder="Search…"
          toolbarExtra={
            <div class="hr-seg" role="group" aria-label="Status filter">
              <For each={STATUS_CHIPS}>
                {(chip) => (
                  <button
                    type="button"
                    classList={{ on: statusFilter() === chip.value }}
                    onClick={() => setStatusFilter(chip.value)}
                  >
                    {chip.label}
                  </button>
                )}
              </For>
            </div>
          }
        />
      </div>

      <Show when={statusFilter() === "final_pay"}>
        <div class="mt-2">
          <HrEmpty title="No “Final pay computing” rows yet" hint="That status needs backend. Pending clearances stay under In clearance until released." />
        </div>
      </Show>

      <section class="hr-w s12 mt-3" aria-label="Final pay">
        <header>
          <h3>Final pay</h3>
          <span class="grow" />
        </header>
        <Show
          when={selectedRow()?.status === "released" && selectedRow()!.pay_period_id > 0}
          fallback={
            <div class="hr-wempty">
              Select a released clearance to open its final-pay period, or release one from the row menu.
              Line items (unpaid salary, 13th month, leave conversion, loans) need a final-pay detail API.
            </div>
          }
        >
          <p class="text-sm">
            Final pay period #{selectedRow()!.pay_period_id} for {selectedRow()!.employee_name}.
          </p>
          <div class="mt-2">
            <A href="/app/hr/payroll-runs" class="hr-btn hr-btn-sm">
              Open payroll runs →
            </A>
          </div>
        </Show>
        <p class="hr-muted mt-2">DOLE Labor Advisory 06-2020: release within 30 days of separation.</p>
      </section>

      <Show when={startOpen()}>
        <div
          class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Start offboarding"
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "Escape") setStartOpen(false);
          }}
        >
          <div class="w-full max-w-md rounded-lg border border-stroke bg-surface p-4 shadow-lg">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold">Start offboarding</h2>
              <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setStartOpen(false)}>
                ✕
              </button>
            </div>
            <div class="grid gap-3">
              <LookupCombo
                label="Employee"
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
                placeholder="Search employees…"
              />
              <label class="block text-sm">
                <span class="mb-1 flex items-center gap-2 font-medium">
                  Reason
                </span>
                <select
                  class="w-full rounded-lg border border-stroke bg-surface px-3 py-2 text-sm"
                  value={reason()}
                  onChange={(e) => setReason(e.currentTarget.value)}
                >
                  <option>Resignation</option>
                  <option>End of contract</option>
                  <option>Termination</option>
                </select>
              </label>
              <label class="block text-sm">
                <span class="mb-1 flex items-center gap-2 font-medium">
                  Last day
                </span>
                <input
                  type="date"
                  class="w-full rounded-lg border border-stroke bg-surface px-3 py-2 text-sm"
                  value={lastDay()}
                  onInput={(e) => setLastDay(e.currentTarget.value)}
                />
              </label>
            </div>
            <div class="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" class="hr-btn" onClick={() => setStartOpen(false)}>
                Cancel
              </button>
              <button type="button" class="hr-btn hr-btn-primary" disabled={saving()} onClick={() => void save()}>
                {saving() ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={checklistOpen() && activeRow()}>
        {(row) => (
          <div
            class="fixed inset-0 z-40 flex justify-end bg-black/30"
            role="dialog"
            aria-modal="true"
            aria-label={`Clearance checklist · ${row().employee_name}`}
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === "Escape") setChecklistOpen(false);
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setChecklistOpen(false);
            }}
          >
            <div class="hr-side-panel flex h-full w-full max-w-md flex-col border-l border-stroke bg-surface shadow-xl">
              <header class="flex items-center justify-between gap-2 border-b border-stroke px-4 py-3">
                <h3 class="text-sm font-semibold">
                  Clearance checklist · {row().employee_name}
                </h3>
                <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setChecklistOpen(false)}>
                  ✕
                </button>
              </header>
              <div class="min-h-0 flex-1 overflow-y-auto p-4">
                <ol class="hr-timeline">
                  <li>
                    <b>HR</b>{" "}
                    <span class="hr-muted">{row().status === "released" ? "cleared" : "pending"}</span>
                  </li>
                  <li>
                    <b>Finance</b> <span class="hr-muted">pending</span>
                  </li>
                  <li>
                    <b>Client site</b> <span class="hr-muted">pending</span>
                  </li>
                </ol>
                <label class="mt-3 flex items-start gap-2 text-sm">
                  <input type="checkbox" disabled class="mt-0.5" />
                  <span>
                    Mark Finance as cleared
                  </span>
                </label>
              </div>
              <footer class="flex justify-end gap-2 border-t border-stroke px-4 py-3">
                <button type="button" class="hr-btn" onClick={() => setChecklistOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  class="hr-btn hr-btn-primary"
                  onClick={() => {
                    toast.warning("Checklist save needs backend.");
                    setChecklistOpen(false);
                  }}
                >
                  Save
                </button>
              </footer>
            </div>
          </div>
        )}
      </Show>

      <Show when={finalPayOpen() && activeRow()}>
        {(row) => (
          <div
            class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Compute final pay"
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === "Escape") setFinalPayOpen(false);
            }}
          >
            <div class="w-full max-w-md rounded-lg border border-stroke bg-surface p-4 shadow-lg">
              <div class="mb-3 flex items-center justify-between gap-2">
                <h2 class="text-sm font-semibold">
                  Compute final pay
                </h2>
                <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setFinalPayOpen(false)}>
                  ✕
                </button>
              </div>
              <p class="text-sm text-text-secondary">
                Unpaid salary, pro-rated 13th month, leave conversion, less loans — detail lines need backend.
                Use <b>Release final pay</b> on the row to run the live final-pay posting for {row().employee_name}.
              </p>
              <label class="mt-3 flex items-start gap-2 text-sm">
                <input type="checkbox" class="mt-0.5" />
                <span>Reviewed by HR.</span>
              </label>
              <div class="mt-4 flex flex-wrap justify-end gap-2">
                <button type="button" class="hr-btn" onClick={() => setFinalPayOpen(false)}>
                  Cancel
                </button>
                <Show when={row().status !== "released"}>
                  <button
                    type="button"
                    class="hr-btn hr-btn-primary"
                    onClick={() => {
                      setFinalPayOpen(false);
                      void release(row());
                    }}
                  >
                    Release final pay
                  </button>
                </Show>
              </div>
            </div>
          </div>
        )}
      </Show>

      <Show when={coeOpen() && activeRow()}>
        {(row) => (
          <div
            class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Certificate of employment"
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === "Escape") setCoeOpen(false);
            }}
          >
            <div class="w-full max-w-lg rounded-lg border border-stroke bg-surface p-4 shadow-lg">
              <div class="mb-3 flex items-center justify-between gap-2">
                <h2 class="text-sm font-semibold">
                  Print / PDF preview — Certificate of employment
                </h2>
                <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setCoeOpen(false)}>
                  ✕
                </button>
              </div>
              <div class="hr-print-preview rounded-lg border border-stroke p-4">
                <b>CERTIFICATE OF EMPLOYMENT</b>
                <p class="hr-muted mt-2">
                  This certifies that {row().employee_name} was employed… Full COE template and PDF export need
                  backend.
                </p>
              </div>
              <div class="mt-4 flex flex-wrap justify-end gap-2">
                <button type="button" class="hr-btn" onClick={() => setCoeOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  class="hr-btn hr-btn-primary"
                  onClick={() => toast.warning("COE PDF needs backend.")}
                >
                  Download PDF
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>
    </HrLayout>
  );
}
