import { createMemo, createSignal, For, Show } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiBase, apiFetch, getAccessToken } from "../../shared/api";
import { getActiveBranchIdCurrent, getActiveTenantId } from "../../shared/activeContext";
import { fetchEmployeeOptions } from "../../shared/useHr";
import { LookupCombo } from "../../shared/LookupCombo";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { ActivityHistoryLink } from "../../shared/ActivityHistoryLink";
import { CustomFieldsSection, validateCustomFields } from "../../shared/CustomFieldsSection";
import { flushStagedCustomFiles } from "../../shared/customFieldFiles";
import { useCustomValues } from "../../shared/useCustomValues";
import { useDocumentDraft } from "../../shared/useDocumentDraft";
import { useFormFieldSettings } from "../../shared/useFormFieldSettings";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";
import { HrBadge, HrEmpty, HrPageHead, HrTcard, type HrBadgeTone } from "./HrUi";

type LeaveType = { id: number; code: string; name: string; is_active: boolean };
type LeaveBalance = {
  id: number;
  employee_no?: string;
  employee_name?: string;
  leave_code?: string;
  leave_name?: string;
  balance_year: number;
  available: number;
  used: number;
  reserved: number;
};
type LeaveRequest = {
  id: number;
  employee_no?: string;
  employee_name?: string;
  leave_code?: string;
  leave_name?: string;
  date_from: string;
  date_to: string;
  days: number;
  status: string;
  client_decision?: string;
  reason: string;
  notes?: string;
  file_count?: number;
  review_notes?: string;
};

type Tab = "q" | "b";
type ReviewAction = "approve" | "reject" | "cancel";

function leaveStatusTone(status: string): HrBadgeTone {
  const s = status.toLowerCase();
  if (s === "approved") return "success";
  if (s === "submitted") return "warning";
  if (s === "rejected" || s === "cancelled") return "danger";
  return "neutral";
}

function labelize(status: string) {
  if (!status) return "—";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatDates(from: string, to: string) {
  if (!from) return "—";
  if (!to || to === from) return from;
  return `${from} – ${to}`;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const tenantId = getActiveTenantId();
  if (tenantId) headers["X-Tenant-ID"] = String(tenantId);
  const branchId = getActiveBranchIdCurrent();
  if (branchId) headers["X-Branch-ID"] = String(branchId);
  return headers;
}

export default function LeavePage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = createSignal<Tab>("q");
  const [empId, setEmpId] = createSignal<number | null>(null);
  const [empLabel, setEmpLabel] = createSignal("");
  const [typeId, setTypeId] = createSignal("");
  const [from, setFrom] = createSignal("");
  const [to, setTo] = createSignal("");
  const [reason, setReason] = createSignal("");
  const [notes, setNotes] = createSignal("");
  const [file, setFile] = createSignal<File | null>(null);
  const [statusFilter, setStatusFilter] = createSignal("");
  const [search, setSearch] = createSignal("");
  const [balanceSearch, setBalanceSearch] = createSignal("");
  const [requestOpen, setRequestOpen] = createSignal(false);
  const [accrueOpen, setAccrueOpen] = createSignal(false);
  const [reviewOpen, setReviewOpen] = createSignal(false);
  const [reviewAction, setReviewAction] = createSignal<ReviewAction>("approve");
  const [reviewRow, setReviewRow] = createSignal<LeaveRequest | null>(null);
  const [reviewNotes, setReviewNotes] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const { customValues, setCustom, loadCustom } = useCustomValues();
  const { activeCustomFields } = useFormFieldSettings("hr_leave_request");

  const buildDraftPayload = () => ({
    employee_id: empId(),
    employee_label: empLabel(),
    leave_type_id: typeId(),
    date_from: from(),
    date_to: to(),
    reason: reason(),
    notes: notes(),
    custom_values: customValues(),
  });

  const draft = useDocumentDraft({
    entityType: "hr_leave_request",
    draftKey: "new",
    getPayload: buildDraftPayload,
    onApply: (payload) => {
      setEmpId(payload.employee_id);
      setEmpLabel(payload.employee_label ?? "");
      setTypeId(payload.leave_type_id ?? "");
      setFrom(payload.date_from ?? "");
      setTo(payload.date_to ?? "");
      setReason(payload.reason ?? "");
      setNotes(payload.notes ?? "");
      loadCustom(payload.custom_values ?? {});
    },
    enabled: () => requestOpen(),
    localOnly: true,
    autoApply: () => false,
  });

  const types = createQuery(() => ({
    queryKey: ["hr-leave-types"],
    queryFn: async () => (await apiFetch<LeaveType[]>("/api/v1/hr/leave-types")).data ?? [],
  }));
  const balances = createQuery(() => ({
    queryKey: ["hr-leave-balances"],
    queryFn: async () => (await apiFetch<LeaveBalance[]>("/api/v1/hr/leave-balances")).data ?? [],
  }));
  const requests = createQuery(() => ({
    queryKey: ["hr-leave-requests", statusFilter()],
    queryFn: async () => {
      const qs = new URLSearchParams({ page: "1", pageSize: "100" });
      if (statusFilter()) qs.set("status", statusFilter());
      return (await apiFetch<LeaveRequest[]>(`/api/v1/hr/leave-requests?${qs}`)).data ?? [];
    },
  }));

  const filteredRequests = createMemo(() => {
    const q = search().trim().toLowerCase();
    return (requests.data ?? []).filter((row) => {
      if (!q) return true;
      return (
        (row.employee_name || "").toLowerCase().includes(q) ||
        (row.employee_no || "").toLowerCase().includes(q) ||
        (row.leave_code || "").toLowerCase().includes(q) ||
        (row.leave_name || "").toLowerCase().includes(q)
      );
    });
  });

  const pendingQueue = createMemo(() => (requests.data ?? []).filter((row) => row.status === "submitted"));

  const filteredBalances = createMemo(() => {
    const q = balanceSearch().trim().toLowerCase();
    return (balances.data ?? []).filter((row) => {
      if (!q) return true;
      return (
        (row.employee_name || "").toLowerCase().includes(q) ||
        (row.employee_no || "").toLowerCase().includes(q) ||
        (row.leave_code || "").toLowerCase().includes(q) ||
        (row.leave_name || "").toLowerCase().includes(q)
      );
    });
  });

  const accrue = async () => {
    setBusy(true);
    const res = await apiFetch("/api/v1/hr/leave-balances/accrue", { method: "POST", body: "{}" });
    setBusy(false);
    setAccrueOpen(false);
    if (!res.success) return toast.warning(res.message ?? "Accrual failed.");
    toast.success("Annual credit applied where missing.");
    void qc.invalidateQueries({ queryKey: ["hr-leave-balances"] });
  };

  const submit = async () => {
    if (!empId() || !typeId() || !from() || !to()) return toast.warning("Employee, type, and dates required.");
    const customError = validateCustomFields(customValues(), activeCustomFields());
    if (customError) return toast.warning(customError);
    setBusy(true);
    const res = await apiFetch<{ id: number }>("/api/v1/hr/leave-requests", {
      method: "POST",
      body: JSON.stringify({
        employee_id: empId(),
        leave_type_id: Number(typeId()),
        date_from: from(),
        date_to: to(),
        reason: reason(),
        notes: notes(),
        status: "submitted",
        custom_values: customValues(),
      }),
    });
    if (!res.success || !res.data) {
      setBusy(false);
      return toast.warning(res.message ?? "Submit failed.");
    }
    const chosen = file();
    if (chosen) {
      const fd = new FormData();
      fd.append("file", chosen);
      const uploaded = await fetch(`${apiBase}/api/v1/hr/leave-requests/${res.data.id}/files`, {
        method: "POST",
        headers: await authHeaders(),
        body: fd,
      });
      if (!uploaded.ok) toast.warning("Leave was saved, but the file upload failed.");
    }
    const filesStored = await flushStagedCustomFiles("hr_leave_request", res.data.id);
    if (!filesStored.ok) toast.warning("Leave was saved, but a custom field file upload failed.");
    setBusy(false);
    toast.success("Leave request submitted.");
    await draft.clearOnSave();
    setReason("");
    setNotes("");
    setFile(null);
    loadCustom({});
    setRequestOpen(false);
    void qc.invalidateQueries({ queryKey: ["hr-leave-requests"] });
    void qc.invalidateQueries({ queryKey: ["hr-leave-balances"] });
  };

  const openReview = (row: LeaveRequest, action: ReviewAction) => {
    setReviewRow(row);
    setReviewAction(action);
    setReviewNotes("");
    setReviewOpen(true);
  };

  const confirmReview = async () => {
    const row = reviewRow();
    if (!row) return;
    if (reviewAction() === "reject" && !reviewNotes().trim()) {
      return toast.warning("Reason for rejection is required.");
    }
    setBusy(true);
    const res = await apiFetch(`/api/v1/hr/leave-requests/${row.id}/${reviewAction()}`, {
      method: "POST",
      body: JSON.stringify({ notes: reviewNotes().trim() }),
    });
    setBusy(false);
    if (!res.success) return toast.warning(res.message ?? "Action failed.");
    const done =
      reviewAction() === "approve" ? "approved" : reviewAction() === "reject" ? "rejected" : "cancelled";
    toast.success(`Request ${done}.`);
    setReviewOpen(false);
    setReviewRow(null);
    void qc.invalidateQueries({ queryKey: ["hr-leave-requests"] });
    void qc.invalidateQueries({ queryKey: ["hr-leave-balances"] });
  };

  const quickApprove = async (row: LeaveRequest) => {
    setBusy(true);
    const res = await apiFetch(`/api/v1/hr/leave-requests/${row.id}/approve`, {
      method: "POST",
      body: JSON.stringify({ notes: "" }),
    });
    setBusy(false);
    if (!res.success) return toast.warning(res.message ?? "Approve failed.");
    toast.success("Request approved.");
    void qc.invalidateQueries({ queryKey: ["hr-leave-requests"] });
    void qc.invalidateQueries({ queryKey: ["hr-leave-balances"] });
  };

  return (
    <HrLayout>
      <HrPageHead
        title="Leave"
        subtitle="Balances, requests and approval. Approved leave updates the DTR."
        actions={
          <div class="hr-actions">
            <button type="button" class="hr-btn" onClick={() => setAccrueOpen(true)}>
              Accrue annual credit
            </button>
            <button type="button" class="hr-btn hr-btn-primary" onClick={() => setRequestOpen(true)}>
              + New request
            </button>
          </div>
        }
      />

      <div class="hr-tabs" role="tablist" aria-label="Leave sections">
        <button type="button" role="tab" classList={{ on: tab() === "q" }} aria-selected={tab() === "q"} onClick={() => setTab("q")}>
          Requests
        </button>
        <button type="button" role="tab" classList={{ on: tab() === "b" }} aria-selected={tab() === "b"} onClick={() => setTab("b")}>
          Balances
        </button>
      </div>

      <Show when={tab() === "q"}>
        <HrTcard
          toolbar={
            <>
              <div class="hr-seg" role="group" aria-label="Status filter">
                <For
                  each={
                    [
                      ["", "All"],
                      ["submitted", "Submitted"],
                      ["approved", "Approved"],
                      ["rejected", "Rejected"],
                    ] as [string, string][]
                  }
                >
                  {([value, label]) => (
                    <button type="button" classList={{ on: statusFilter() === value }} onClick={() => setStatusFilter(value)}>
                      {label}
                    </button>
                  )}
                </For>
              </div>
              <input
                class="grow rounded-lg border border-stroke bg-surface px-3 py-2 text-sm"
                placeholder="Search employee…"
                aria-label="Search"
                value={search()}
                onInput={(e) => setSearch(e.currentTarget.value)}
              />
            </>
          }
        >
          <div class="hr-tbl-wrap">
            <table class="hr-tbl">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Type</th>
                  <th>Dates</th>
                  <th class="num">Days</th>
                  <th>Notes</th>
                  <th>Files</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                <For
                  each={filteredRequests()}
                  fallback={
                    <tr>
                      <td colspan="8">
                        <HrEmpty title="No matches" hint="Try a different search or clear the filters." />
                      </td>
                    </tr>
                  }
                >
                  {(r) => (
                    <tr>
                      <td>
                        <div class="font-semibold">{r.employee_name}</div>
                        <div class="hr-muted">{r.employee_no}</div>
                      </td>
                      <td>
                        {r.leave_name || r.leave_code || "—"}{" "}
                        <Show when={r.leave_code}>
                          <span class="hr-muted">{r.leave_code}</span>
                        </Show>
                      </td>
                      <td>{formatDates(r.date_from, r.date_to)}</td>
                      <td class="num">{r.days}</td>
                      <td>{r.notes || r.reason || "—"}</td>
                      <td>
                        <Show when={(r.file_count ?? 0) > 0} fallback={<span class="hr-muted">—</span>}>
                          📎 {r.file_count}
                        </Show>
                      </td>
                      <td>
                        <HrBadge tone={leaveStatusTone(r.status)}>{labelize(r.status)}</HrBadge>
                      </td>
                      <td>
                        <div class="flex flex-wrap items-center gap-1">
                          <Show when={r.status === "submitted"}>
                            <button type="button" class="hr-btn hr-btn-primary hr-btn-sm" disabled={busy()} onClick={() => void quickApprove(r)}>
                              Approve
                            </button>
                          </Show>
                          <ActivityHistoryLink
                            module="hr"
                            targetType="hr_leave_request"
                            targetId={r.id}
                            title={`Leave history · ${r.employee_name ?? ""}`}
                            class="hr-btn hr-btn-sm"
                          />
                          <Show when={r.status === "submitted"}>
                            <details class="hr-menu hr-rowmenu">
                              <summary class="hr-rowmenu-btn" aria-label="More">
                                ⋯
                              </summary>
                              <div>
                                <button type="button" class="menu-item" onClick={() => openReview(r, "approve")}>
                                  Approve with remarks…
                                </button>
                                <button type="button" class="menu-item" onClick={() => openReview(r, "reject")}>
                                  Reject…
                                </button>
                                <button type="button" class="menu-item text-red-700" onClick={() => openReview(r, "cancel")}>
                                  Cancel…
                                </button>
                              </div>
                            </details>
                          </Show>
                        </div>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </HrTcard>

        <Show when={statusFilter() === "" || statusFilter() === "submitted"}>
          <section class="hr-w s12 mt-3" aria-label="Pending approvals">
            <header>
              <h3>Pending approvals</h3>
              <span class="grow" />
              <HrBadge tone={pendingQueue().length > 0 ? "warning" : "neutral"}>{pendingQueue().length}</HrBadge>
            </header>
            <ul class="hr-aq">
              <For each={pendingQueue().slice(0, 8)} fallback={<li><div class="hr-wempty" style={{ width: "100%" }}>No submitted requests waiting.</div></li>}>
                {(r) => (
                  <li>
                    <span class="t">
                      <b>
                        {r.employee_name} · {r.leave_name || r.leave_code} · {formatDates(r.date_from, r.date_to)}
                      </b>
                      <span class="xs">{r.days} day(s) · {r.notes || r.reason || "No notes"}</span>
                    </span>
                    <button type="button" class="hr-btn hr-btn-primary hr-btn-sm" disabled={busy()} onClick={() => openReview(r, "approve")}>
                      Approve…
                    </button>
                    <button type="button" class="hr-btn hr-btn-sm" disabled={busy()} onClick={() => openReview(r, "reject")}>
                      Reject…
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </section>
        </Show>
      </Show>

      <Show when={tab() === "b"}>
        <HrTcard
          toolbar={
            <input
              class="grow rounded-lg border border-stroke bg-surface px-3 py-2 text-sm"
              placeholder="Search employee…"
              aria-label="Search balances"
              value={balanceSearch()}
              onInput={(e) => setBalanceSearch(e.currentTarget.value)}
            />
          }
        >
          <div class="hr-tbl-wrap">
            <table class="hr-tbl">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Type</th>
                  <th>Year</th>
                  <th class="num">Available</th>
                  <th class="num">Used</th>
                  <th class="num">Reserved</th>
                </tr>
              </thead>
              <tbody>
                <For
                  each={filteredBalances()}
                  fallback={
                    <tr>
                      <td colspan="6">
                        <HrEmpty title="No balances" hint="Run Accrue annual credit to seed opening balances where missing." />
                      </td>
                    </tr>
                  }
                >
                  {(b) => (
                    <tr>
                      <td>
                        <div class="font-semibold">{b.employee_name}</div>
                        <div class="hr-muted">{b.employee_no}</div>
                      </td>
                      <td>
                        {b.leave_name || "—"} <span class="hr-muted">{b.leave_code}</span>
                      </td>
                      <td>{b.balance_year}</td>
                      <td class="num">{b.available}</td>
                      <td class="num">{b.used}</td>
                      <td class="num">{b.reserved}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </HrTcard>
      </Show>

      <p class="hr-muted mt-3">
        Client approval of worker leave in the client portal
      </p>

      <Show when={requestOpen()}>
        <div
          class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="New leave request"
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "Escape") setRequestOpen(false);
          }}
        >
          <div class="max-h-[90vh] w-full max-w-lg overflow-auto rounded-lg border border-stroke bg-surface p-4 shadow-lg">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold">New leave request</h2>
              <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setRequestOpen(false)}>
                ✕
              </button>
            </div>
            <draft.DraftBanner />
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
                  fetchOptions={(q) => fetchEmployeeOptions(q, "active")}
                  placeholder="Search employees…"
                />
              </div>
              <Field label="Leave type">
                <select class={inputClass} value={typeId()} onChange={(e) => setTypeId(e.currentTarget.value)}>
                  <option value="">Select…</option>
                  <For each={(types.data ?? []).filter((t) => t.is_active)}>
                    {(t) => (
                      <option value={t.id}>
                        {t.name} ({t.code})
                      </option>
                    )}
                  </For>
                </select>
              </Field>
              <div />
              <Field label="From">
                <input type="date" class={inputClass} value={from()} onInput={(e) => setFrom(e.currentTarget.value)} />
              </Field>
              <Field label="To">
                <input type="date" class={inputClass} value={to()} onInput={(e) => setTo(e.currentTarget.value)} />
              </Field>
              <div class="sm:col-span-2">
                <Field label="Notes">
                  <textarea class={inputClass} value={notes()} onInput={(e) => setNotes(e.currentTarget.value)} placeholder="Optional" />
                </Field>
              </div>
              <div class="sm:col-span-2">
                <Field label="Reason">
                  <input class={inputClass} value={reason()} onInput={(e) => setReason(e.currentTarget.value)} placeholder="Optional" />
                </Field>
              </div>
              <div class="sm:col-span-2">
                <label class="block text-sm">
                  <span class="mb-1 block font-medium">📎 Attach file (optional)</span>
                  <input type="file" class={inputClass} onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)} />
                </label>
              </div>
              <div class="sm:col-span-2">
                <CustomFieldsSection entityType="hr_leave_request" values={customValues} onChange={setCustom} />
              </div>
            </div>
            <div class="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" class="hr-btn" onClick={() => setRequestOpen(false)}>
                Cancel
              </button>
              <button type="button" class="hr-btn hr-btn-primary" disabled={busy()} onClick={() => void submit()}>
                {busy() ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={accrueOpen()}>
        <div
          class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Accrue annual credit?"
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "Escape") setAccrueOpen(false);
          }}
        >
          <div class="w-full max-w-md rounded-lg border border-stroke bg-surface p-4 shadow-lg">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold">Accrue annual credit?</h2>
              <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setAccrueOpen(false)}>
                ✕
              </button>
            </div>
            <p class="text-sm text-text-secondary">
              Adds this year&apos;s leave credits to every eligible employee&apos;s balance. Existing balances are kept.
            </p>
            <div class="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" class="hr-btn" onClick={() => setAccrueOpen(false)}>
                Cancel
              </button>
              <button type="button" class="hr-btn hr-btn-primary" disabled={busy()} onClick={() => void accrue()}>
                Accrue
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={reviewOpen() && reviewRow()}>
        {(row) => (
          <div
            class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
            role="dialog"
            aria-modal="true"
            aria-label={`${labelize(reviewAction())} leave`}
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === "Escape") setReviewOpen(false);
            }}
          >
            <div class="w-full max-w-md rounded-lg border border-stroke bg-surface p-4 shadow-lg">
              <div class="mb-3 flex items-center justify-between gap-2">
                <h2 class="text-sm font-semibold">
                  {reviewAction() === "approve" ? "Approve leave" : reviewAction() === "reject" ? "Reject leave" : "Cancel leave request"}
                </h2>
                <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setReviewOpen(false)}>
                  ✕
                </button>
              </div>
              <p class="mb-3 text-sm">
                <b>{row().employee_name}</b> · {row().leave_name || row().leave_code} · {formatDates(row().date_from, row().date_to)}
              </p>
              <Show when={reviewAction() === "approve"}>
                <p class="mb-3 text-sm text-text-secondary">Approving updates the DTR for those dates.</p>
              </Show>
              <label class="block text-sm">
                <span class="mb-1 block font-medium">
                  {reviewAction() === "reject" ? (
                    <>
                      Reason for rejection <span class="text-red-700">*</span>
                    </>
                  ) : (
                    "Remarks (optional)"
                  )}
                </span>
                <textarea
                  class={inputClass}
                  value={reviewNotes()}
                  onInput={(e) => setReviewNotes(e.currentTarget.value)}
                  rows={3}
                />
              </label>
              <div class="mt-4 flex flex-wrap justify-end gap-2">
                <button type="button" class="hr-btn" onClick={() => setReviewOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  class={reviewAction() === "approve" ? "hr-btn hr-btn-primary" : "hr-btn hr-btn-sm rounded-lg border border-red-300 bg-red-600 px-3 text-white"}
                  disabled={busy()}
                  onClick={() => void confirmReview()}
                >
                  {labelize(reviewAction())}
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>
    </HrLayout>
  );
}
