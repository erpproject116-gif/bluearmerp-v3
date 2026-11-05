import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { apiBase, apiFetch, getAccessToken } from "../../shared/api";
import { LookupCombo } from "../../shared/LookupCombo";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { fetchEmployeeOptions } from "../../shared/useHr";
import { useToast } from "../../shared/toast";
import { HrCasesTabs } from "./HrCasesTabs";
import { HrLayout } from "./HrLayout";
import { HrBadge, HrEmpty, HrPageHead, HrTcard, type HrBadgeTone } from "./HrUi";

type Problem = {
  id: number;
  case_no: string;
  employee_name: string;
  category: string;
  priority: string;
  status: string;
  is_private?: boolean;
  owner_user_id?: number;
  next_action: string;
  target_date: string;
  late: boolean;
  description: string;
};

type ModalKind = "new" | "assign" | "next" | "close" | "open" | null;

const CATEGORIES: { value: string; label: string }[] = [
  { value: "attendance", label: "Attendance" },
  { value: "performance", label: "Performance" },
  { value: "workplace_conflict", label: "Workplace conflict" },
  { value: "payroll", label: "Pay" },
  { value: "employee_complaint", label: "Employee complaint" },
  { value: "sick_leave", label: "Sick leave" },
  { value: "client_complaint", label: "Client complaint" },
  { value: "transfer", label: "Transfer" },
  { value: "safety", label: "Safety" },
  { value: "other", label: "Other" },
];

const STATUSES: { value: string; label: string }[] = [
  { value: "new", label: "New" },
  { value: "assigned", label: "Assigned" },
  { value: "under_review", label: "Under review" },
  { value: "awaiting_response", label: "Waiting for a reply" },
  { value: "action_required", label: "Action needed" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const OPEN_STATUSES = new Set(["new", "assigned", "under_review", "awaiting_response", "action_required"]);

function categoryLabel(value: string) {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value.replace(/_/g, " ");
}

function statusLabel(value: string) {
  return STATUSES.find((s) => s.value === value)?.label ?? value.replace(/_/g, " ");
}

function priorityLabel(value: string) {
  if (!value) return "—";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function priorityTone(value: string): HrBadgeTone {
  const p = value.toLowerCase();
  if (p === "high" || p === "critical") return "danger";
  if (p === "medium") return "warning";
  return "neutral";
}

function statusTone(value: string): HrBadgeTone {
  switch (value) {
    case "action_required":
      return "danger";
    case "awaiting_response":
      return "warning";
    case "under_review":
      return "info";
    case "assigned":
    case "new":
      return "brand";
    case "resolved":
      return "success";
    default:
      return "neutral";
  }
}

function lateDays(target: string): number | null {
  if (!target) return null;
  const t = new Date(`${target}T00:00:00`);
  if (Number.isNaN(t.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - t.getTime()) / 86400000);
  return diff > 0 ? diff : null;
}

export default function WorkplaceProblemsPage() {
  const toast = useToast();
  const [seg, setSeg] = createSignal<"" | "late">("");
  const [search, setSearch] = createSignal("");
  const [categoryFilter, setCategoryFilter] = createSignal("");
  const [priorityFilter, setPriorityFilter] = createSignal("");
  const [statusFilter, setStatusFilter] = createSignal("");
  const [modal, setModal] = createSignal<ModalKind>(null);
  const [active, setActive] = createSignal<Problem | null>(null);

  const [empId, setEmpId] = createSignal<number | null>(null);
  const [empLabel, setEmpLabel] = createSignal("");
  const [category, setCategory] = createSignal("attendance");
  const [priority, setPriority] = createSignal("medium");
  const [description, setDescription] = createSignal("");
  const [nextAction, setNextAction] = createSignal("");
  const [target, setTarget] = createSignal("");
  const [isPrivate, setIsPrivate] = createSignal(false);
  const [owner, setOwner] = createSignal("");
  const [file, setFile] = createSignal<File | null>(null);
  const [note, setNote] = createSignal("");
  const [closeStatus, setCloseStatus] = createSignal("resolved");
  const [busy, setBusy] = createSignal(false);

  const [problems, { refetch }] = createResource(async () => (await apiFetch<Problem[]>("/api/v1/hr/workplace-problems")).data ?? []);

  const rows = createMemo(() => {
    const q = search().trim().toLowerCase();
    return (problems() ?? []).filter((row) => {
      if (seg() === "late" && !row.late) return false;
      if (seg() === "" && !statusFilter() && !OPEN_STATUSES.has(row.status)) return false;
      if (categoryFilter() && row.category !== categoryFilter()) return false;
      if (priorityFilter() && row.priority !== priorityFilter()) return false;
      if (statusFilter() && row.status !== statusFilter()) return false;
      if (!q) return true;
      return (
        row.case_no.toLowerCase().includes(q) ||
        (row.employee_name || "").toLowerCase().includes(q) ||
        (row.next_action || "").toLowerCase().includes(q) ||
        categoryLabel(row.category).toLowerCase().includes(q)
      );
    });
  });

  const openModal = (kind: ModalKind, row?: Problem) => {
    setActive(row ?? null);
    setNote("");
    if (kind === "assign" && row) {
      setOwner(row.owner_user_id && row.owner_user_id > 0 ? String(row.owner_user_id) : "");
      setTarget(row.target_date || "");
    }
    if (kind === "next" && row) {
      setNextAction(row.next_action || "");
      setTarget(row.target_date || "");
    }
    if (kind === "close") setCloseStatus("resolved");
    if (kind === "new") {
      setEmpId(null);
      setEmpLabel("");
      setCategory("attendance");
      setPriority("medium");
      setDescription("");
      setNextAction("");
      setTarget("");
      setIsPrivate(false);
      setOwner("");
      setFile(null);
    }
    setModal(kind);
  };

  const create = async () => {
    if (!empId()) return toast.warning("Choose an employee.");
    if (!description().trim()) return toast.warning("Details are required.");
    setBusy(true);
    const res = await apiFetch("/api/v1/hr/workplace-problems", {
      method: "POST",
      body: JSON.stringify({
        employee_id: empId(),
        category: category(),
        priority: priority(),
        description: description().trim(),
        next_action: nextAction().trim(),
        target_date: target(),
        is_private: isPrivate(),
        owner_user_id: Number(owner()) || 0,
      }),
    });
    if (!res.success) {
      setBusy(false);
      return toast.warning(res.message ?? "Could not save.");
    }
    const created = res.data as { id?: number } | undefined;
    if (file() && created?.id) {
      const data = new FormData();
      data.set("file", file()!);
      const token = await getAccessToken();
      await fetch(`${apiBase}/api/v1/hr/workplace-problems/${created.id}/files`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: data,
      });
    }
    setBusy(false);
    toast.success("Workplace problem saved.");
    setModal(null);
    void refetch();
  };

  const assign = async () => {
    const row = active();
    if (!row) return;
    if (!note().trim()) return toast.warning("Note is required.");
    if (!owner().trim()) return toast.warning("Owner user id is required.");
    setBusy(true);
    const res = await apiFetch(`/api/v1/hr/workplace-problems/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        owner_user_id: Number(owner()),
        target_date: target() || null,
        status: "assigned",
        next_action: note().trim(),
      }),
    });
    setBusy(false);
    if (!res.success) return toast.warning(res.message ?? "Could not assign.");
    toast.success("Owner assigned.");
    setModal(null);
    void refetch();
  };

  const logNext = async () => {
    const row = active();
    if (!row) return;
    if (!nextAction().trim()) return toast.warning("Next step is required.");
    setBusy(true);
    const res = await apiFetch(`/api/v1/hr/workplace-problems/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        next_action: nextAction().trim(),
        target_date: target() || null,
        status: row.status === "new" ? "action_required" : undefined,
      }),
    });
    setBusy(false);
    if (!res.success) return toast.warning(res.message ?? "Could not save.");
    toast.success("Next step saved.");
    setModal(null);
    void refetch();
  };

  const closeProblem = async () => {
    const row = active();
    if (!row) return;
    if (!note().trim()) return toast.warning("Resolution remarks are required.");
    const status = closeStatus() === "resolved" ? "resolved" : "closed";
    setBusy(true);
    const res = await apiFetch(`/api/v1/hr/workplace-problems/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status,
        next_action: note().trim(),
      }),
    });
    setBusy(false);
    if (!res.success) return toast.warning(res.message ?? "Could not close.");
    toast.success("Problem closed.");
    setModal(null);
    void refetch();
  };

  return (
    <HrLayout>
      <HrCasesTabs />
      <HrPageHead
        title="Workplace problems"
        subtitle="Every open problem needs an owner, a next step and a target date."
        actions={
          <button type="button" class="hr-btn hr-btn-primary" onClick={() => openModal("new")}>
            + New problem
          </button>
        }
      />

      <HrTcard
        toolbar={
          <>
            <div class="hr-seg" role="group" aria-label="Open filter">
              <button type="button" classList={{ on: seg() === "" }} onClick={() => setSeg("")}>
                All open
              </button>
              <button type="button" classList={{ on: seg() === "late" }} onClick={() => setSeg("late")}>
                Late
              </button>
            </div>
            <input
              class="grow rounded-lg border border-stroke bg-surface px-3 py-2 text-sm"
              placeholder="Search case no., employee…"
              aria-label="Search"
              value={search()}
              onInput={(e) => setSearch(e.currentTarget.value)}
            />
            <select
              class="rounded-lg border border-stroke bg-surface px-2 text-sm"
              aria-label="Category"
              value={categoryFilter()}
              onChange={(e) => setCategoryFilter(e.currentTarget.value)}
            >
              <option value="">Category: All</option>
              <For each={CATEGORIES}>{(c) => <option value={c.value}>{c.label}</option>}</For>
            </select>
            <select
              class="rounded-lg border border-stroke bg-surface px-2 text-sm"
              aria-label="Priority"
              value={priorityFilter()}
              onChange={(e) => setPriorityFilter(e.currentTarget.value)}
            >
              <option value="">Priority: All</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="critical">Critical</option>
            </select>
            <select
              class="rounded-lg border border-stroke bg-surface px-2 text-sm"
              aria-label="Status"
              value={statusFilter()}
              onChange={(e) => setStatusFilter(e.currentTarget.value)}
            >
              <option value="">Status: All</option>
              <For each={STATUSES}>{(s) => <option value={s.value}>{s.label}</option>}</For>
            </select>
          </>
        }
      >
        <div class="hr-tbl-wrap">
          <table class="hr-tbl">
            <thead>
              <tr>
                <th>Case</th>
                <th>Employee</th>
                <th>Category</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Owner</th>
                <th>Next step</th>
                <th>Target date</th>
                <th>Late</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              <For
                each={rows()}
                fallback={
                  <tr>
                    <td colspan="10">
                      <HrEmpty title="No matches" hint="Try a different search or clear the filters." />
                    </td>
                  </tr>
                }
              >
                {(row) => {
                  const days = () => (row.late ? lateDays(row.target_date) : null);
                  return (
                    <tr>
                      <td>
                        <b class="font-mono text-sm">{row.case_no}</b>
                      </td>
                      <td>
                        <Show when={row.is_private} fallback={row.employee_name}>
                          🔒 {row.employee_name}
                        </Show>
                      </td>
                      <td>{categoryLabel(row.category)}</td>
                      <td>
                        <HrBadge tone={priorityTone(row.priority)}>{priorityLabel(row.priority)}</HrBadge>
                      </td>
                      <td>
                        <HrBadge tone={statusTone(row.status)}>{statusLabel(row.status)}</HrBadge>
                      </td>
                      <td>
                        <Show when={row.owner_user_id && row.owner_user_id > 0} fallback={<HrBadge tone="danger">No owner</HrBadge>}>
                          #{row.owner_user_id}
                        </Show>
                      </td>
                      <td>{row.next_action || "Not set"}</td>
                      <td classList={{ "text-red-700": !!row.late }}>{row.target_date || "Not set"}</td>
                      <td>
                        <Show when={days() != null}>
                          <HrBadge tone="danger">Late {days()}d</HrBadge>
                        </Show>
                      </td>
                      <td>
                        <details class="hr-menu hr-rowmenu">
                          <summary class="hr-rowmenu-btn" aria-label="Row actions">
                            ⋯
                          </summary>
                          <div>
                            <button type="button" class="menu-item" onClick={() => openModal("open", row)}>
                              Open
                            </button>
                            <button type="button" class="menu-item" onClick={() => openModal("assign", row)}>
                              Reassign owner
                            </button>
                            <button type="button" class="menu-item" onClick={() => openModal("next", row)}>
                              Log next step
                            </button>
                            <button type="button" class="menu-item" onClick={() => openModal("close", row)}>
                              Resolve…
                            </button>
                          </div>
                        </details>
                      </td>
                    </tr>
                  );
                }}
              </For>
            </tbody>
          </table>
        </div>
      </HrTcard>

      <p class="hr-muted mt-2">
        “Late” is worked out when the list loads (target date passed). Private problems are visible only to the owner and HR admins. Client
        workplace and pay handler
      </p>

      <Show when={modal() === "new"}>
        <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="New problem">
          <div class="max-h-[90vh] w-full max-w-lg overflow-auto rounded-lg border border-stroke bg-surface p-4 shadow-lg">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold">New problem</h2>
              <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setModal(null)}>
                ✕
              </button>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <div class="sm:col-span-2">
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
              </div>
              <Field label="Category">
                <select class={inputClass} value={category()} onChange={(e) => setCategory(e.currentTarget.value)}>
                  <For each={CATEGORIES}>{(c) => <option value={c.value}>{c.label}</option>}</For>
                </select>
              </Field>
              <Field label="Priority">
                <select class={inputClass} value={priority()} onChange={(e) => setPriority(e.currentTarget.value)}>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="low">Low</option>
                  <option value="critical">Critical</option>
                </select>
              </Field>
              <Field label="Owner user id">
                <input class={inputClass} value={owner()} onInput={(e) => setOwner(e.currentTarget.value)} placeholder="Optional" />
              </Field>
              <Field label="Target date">
                <input type="date" class={inputClass} value={target()} onInput={(e) => setTarget(e.currentTarget.value)} />
              </Field>
              <div class="sm:col-span-2">
                <Field label="Next step">
                  <input class={inputClass} value={nextAction()} onInput={(e) => setNextAction(e.currentTarget.value)} />
                </Field>
              </div>
              <label class="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" checked={isPrivate()} onChange={(e) => setIsPrivate(e.currentTarget.checked)} />
                Private (owner and HR admins only)
              </label>
              <div class="sm:col-span-2">
                <Field label="Details">
                  <textarea class={inputClass} rows={3} value={description()} onInput={(e) => setDescription(e.currentTarget.value)} />
                </Field>
              </div>
              <div class="sm:col-span-2">
                <Field label="File">
                  <input type="file" class={inputClass} onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)} />
                </Field>
              </div>
            </div>
            <div class="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" class="hr-btn" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button type="button" class="hr-btn hr-btn-primary" disabled={busy()} onClick={() => void create()}>
                Save
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={modal() === "assign" && active()}>
        {(row) => (
          <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="Assign owner">
            <div class="w-full max-w-md rounded-lg border border-stroke bg-surface p-4 shadow-lg">
              <div class="mb-3 flex items-center justify-between gap-2">
                <h2 class="text-sm font-semibold">Assign owner</h2>
                <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setModal(null)}>
                  ✕
                </button>
              </div>
              <p class="mb-3 text-sm">
                <b class="font-mono">{row().case_no}</b> · {row().employee_name}
              </p>
              <div class="grid gap-3">
                <Field label="Owner user id">
                  <input class={inputClass} value={owner()} onInput={(e) => setOwner(e.currentTarget.value)} />
                </Field>
                <Field label="Target date">
                  <input type="date" class={inputClass} value={target()} onInput={(e) => setTarget(e.currentTarget.value)} />
                </Field>
                <label class="block text-sm">
                  <span class="mb-1 block font-medium">
                    Note <span class="text-red-700">*</span>
                  </span>
                  <textarea class={inputClass} rows={3} value={note()} onInput={(e) => setNote(e.currentTarget.value)} />
                </label>
              </div>
              <div class="mt-4 flex flex-wrap justify-end gap-2">
                <button type="button" class="hr-btn" onClick={() => setModal(null)}>
                  Cancel
                </button>
                <button type="button" class="hr-btn hr-btn-primary" disabled={busy()} onClick={() => void assign()}>
                  Assign
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>

      <Show when={modal() === "next" && active()}>
        {(row) => (
          <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="Log next step">
            <div class="w-full max-w-md rounded-lg border border-stroke bg-surface p-4 shadow-lg">
              <div class="mb-3 flex items-center justify-between gap-2">
                <h2 class="text-sm font-semibold">Log next step</h2>
                <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setModal(null)}>
                  ✕
                </button>
              </div>
              <p class="mb-3 text-sm">
                <b class="font-mono">{row().case_no}</b> · {row().employee_name}
              </p>
              <label class="mb-3 block text-sm">
                <span class="mb-1 block font-medium">
                  Next step <span class="text-red-700">*</span>
                </span>
                <textarea class={inputClass} rows={3} value={nextAction()} onInput={(e) => setNextAction(e.currentTarget.value)} />
              </label>
              <Field label="Target date">
                <input type="date" class={inputClass} value={target()} onInput={(e) => setTarget(e.currentTarget.value)} />
              </Field>
              <div class="mt-4 flex flex-wrap justify-end gap-2">
                <button type="button" class="hr-btn" onClick={() => setModal(null)}>
                  Cancel
                </button>
                <button type="button" class="hr-btn hr-btn-primary" disabled={busy()} onClick={() => void logNext()}>
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>

      <Show when={modal() === "close" && active()}>
        {(row) => (
          <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="Close problem">
            <div class="w-full max-w-md rounded-lg border border-stroke bg-surface p-4 shadow-lg">
              <div class="mb-3 flex items-center justify-between gap-2">
                <h2 class="text-sm font-semibold">Close problem</h2>
                <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setModal(null)}>
                  ✕
                </button>
              </div>
              <p class="mb-3 text-sm">
                <b class="font-mono">{row().case_no}</b> · {row().employee_name}
              </p>
              <Field label="Closing status">
                <select class={inputClass} value={closeStatus()} onChange={(e) => setCloseStatus(e.currentTarget.value)}>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed – no action</option>
                </select>
              </Field>
              <label class="mt-3 block text-sm">
                <span class="mb-1 block font-medium">
                  Resolution remarks <span class="text-red-700">*</span>
                </span>
                <textarea class={inputClass} rows={3} value={note()} onInput={(e) => setNote(e.currentTarget.value)} />
              </label>
              <div class="mt-4 flex flex-wrap justify-end gap-2">
                <button type="button" class="hr-btn" onClick={() => setModal(null)}>
                  Cancel
                </button>
                <button type="button" class="hr-btn hr-btn-primary" disabled={busy()} onClick={() => void closeProblem()}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>

      <Show when={modal() === "open" && active()}>
        {(row) => (
          <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="Problem detail">
            <div class="w-full max-w-md rounded-lg border border-stroke bg-surface p-4 shadow-lg">
              <div class="mb-3 flex items-center justify-between gap-2">
                <h2 class="text-sm font-semibold">
                  <span class="font-mono">{row().case_no}</span> · {row().employee_name}
                </h2>
                <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setModal(null)}>
                  ✕
                </button>
              </div>
              <ul class="hr-aq text-sm">
                <li>
                  <span class="t">
                    <b>
                      {categoryLabel(row().category)} · {priorityLabel(row().priority)}
                    </b>
                    <span class="xs">
                      <HrBadge tone={statusTone(row().status)}>{statusLabel(row().status)}</HrBadge>
                    </span>
                  </span>
                </li>
                <li>
                  <span class="t">
                    <b>Next step</b>
                    <span class="xs">{row().next_action || "Not set"}</span>
                  </span>
                </li>
                <li>
                  <span class="t">
                    <b>Target</b>
                    <span class="xs">{row().target_date || "Not set"}</span>
                  </span>
                </li>
                <li>
                  <span class="t">
                    <b>Details</b>
                    <span class="xs">{row().description || "—"}</span>
                  </span>
                </li>
              </ul>
              <div class="mt-4 flex flex-wrap justify-end gap-2">
                <button type="button" class="hr-btn" onClick={() => setModal(null)}>
                  Close
                </button>
                <button type="button" class="hr-btn hr-btn-primary" onClick={() => openModal("next", row())}>
                  Log next step
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>
    </HrLayout>
  );
}
