import { createSignal, For, Show } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiBase, apiFetch, getAccessToken } from "../../shared/api";
import { getActiveBranchIdCurrent, getActiveTenantId } from "../../shared/activeContext";
import { fetchEmployeeOptions } from "../../shared/useHr";
import { LookupCombo } from "../../shared/LookupCombo";
import { EntityModal, Field, inputClass } from "../../shared/SpreadsheetGrid";
import { ActivityHistoryLink } from "../../shared/ActivityHistoryLink";
import { CustomFieldsSection, validateCustomFields } from "../../shared/CustomFieldsSection";
import { flushStagedCustomFiles } from "../../shared/customFieldFiles";
import { useCustomValues } from "../../shared/useCustomValues";
import { useDocumentDraft } from "../../shared/useDocumentDraft";
import { useFormFieldSettings } from "../../shared/useFormFieldSettings";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";

type LeaveType = { id: number; code: string; name: string; is_active: boolean };
type LeaveBalance = {
  id: number; employee_no?: string; employee_name?: string; leave_code?: string;
  leave_name?: string; balance_year: number; available: number; used: number; reserved: number;
};
type LeaveRequest = {
  id: number; employee_no?: string; employee_name?: string; leave_code?: string;
  date_from: string; date_to: string; days: number; status: string; reason: string;
  notes?: string; file_count?: number;
};

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
  const [empId, setEmpId] = createSignal<number | null>(null);
  const [empLabel, setEmpLabel] = createSignal("");
  const [typeId, setTypeId] = createSignal("");
  const [from, setFrom] = createSignal("");
  const [to, setTo] = createSignal("");
  const [reason, setReason] = createSignal("");
  const [notes, setNotes] = createSignal("");
  const [file, setFile] = createSignal<File | null>(null);
  const [statusFilter, setStatusFilter] = createSignal("submitted");
  const [requestOpen, setRequestOpen] = createSignal(false);
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

  const accrue = async () => {
    const res = await apiFetch("/api/v1/hr/leave-balances/accrue", { method: "POST", body: "{}" });
    if (!res.success) return toast.warning(res.message ?? "Accrual failed.");
    toast.success("Annual credit applied where missing.");
    void qc.invalidateQueries({ queryKey: ["hr-leave-balances"] });
  };

  const submit = async () => {
    if (!empId() || !typeId() || !from() || !to()) return toast.warning("Employee, type, and dates required.");
    const customError = validateCustomFields(customValues(), activeCustomFields());
    if (customError) return toast.warning(customError);
    const res = await apiFetch<{ id: number }>("/api/v1/hr/leave-requests", {
      method: "POST",
      body: JSON.stringify({
        employee_id: empId(), leave_type_id: Number(typeId()),
        date_from: from(), date_to: to(), reason: reason(), notes: notes(), status: "submitted",
        custom_values: customValues(),
      }),
    });
    if (!res.success || !res.data) return toast.warning(res.message ?? "Submit failed.");
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

  const act = async (id: number, action: "approve" | "reject" | "cancel") => {
    const res = await apiFetch(`/api/v1/hr/leave-requests/${id}/${action}`, { method: "POST", body: "{}" });
    if (!res.success) return toast.warning(res.message ?? "Action failed.");
    toast.success(`Request ${action}d.`);
    void qc.invalidateQueries({ queryKey: ["hr-leave-requests"] });
    void qc.invalidateQueries({ queryKey: ["hr-leave-balances"] });
  };

  return (
    <HrLayout>
      <h1 class="mb-1 text-2xl font-semibold">Leave</h1>
      <p class="mb-6 text-sm text-text-secondary">Balances, requests, and approval. Approved leave stamps DTR.</p>
      <button type="button" class="mb-4 rounded-lg border border-stroke px-3 py-1.5 text-sm" onClick={() => void accrue()}>
        Accrue annual credit
      </button>

      <button type="button" class="mb-4 rounded-lg bg-brand-600 px-4 py-2 text-sm text-white" onClick={() => setRequestOpen(true)}>
        New request
      </button>
      <EntityModal
        open={requestOpen()}
        title="New request"
        onClose={() => setRequestOpen(false)}
        onSave={() => void submit()}
        saveLabel="Submit leave"
      >
        <draft.DraftBanner />
        <LookupCombo
          label="Employee"
          value={empLabel}
          selectedId={empId}
          onInput={setEmpLabel}
          onSelect={(o) => { setEmpId(o.id); setEmpLabel(o.label); }}
          onClear={() => { setEmpId(null); setEmpLabel(""); }}
          fetchOptions={(q) => fetchEmployeeOptions(q, "active")}
          placeholder="Search employees…"
        />
        <Field label="Leave type">
          <select class={inputClass} value={typeId()} onChange={(e) => setTypeId(e.currentTarget.value)}>
            <option value="">Select…</option>
            <For each={(types.data ?? []).filter((t) => t.is_active)}>
              {(t) => <option value={t.id}>{t.code} — {t.name}</option>}
            </For>
          </select>
        </Field>
        <Field label="From"><input type="date" class={inputClass} value={from()} onInput={(e) => setFrom(e.currentTarget.value)} /></Field>
        <Field label="To"><input type="date" class={inputClass} value={to()} onInput={(e) => setTo(e.currentTarget.value)} /></Field>
        <Field label="Reason"><input class={inputClass} value={reason()} onInput={(e) => setReason(e.currentTarget.value)} placeholder="Optional" /></Field>
        <Field label="Notes"><input class={inputClass} value={notes()} onInput={(e) => setNotes(e.currentTarget.value)} placeholder="Optional" /></Field>
        <Field label="Attachment"><input type="file" class={inputClass} onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)} /></Field>
        <CustomFieldsSection entityType="hr_leave_request" values={customValues} onChange={setCustom} />
      </EntityModal>

      <section class="mb-6 rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-lg font-medium">Request queue</h2>
          <select class={inputClass + " w-40"} value={statusFilter()} onChange={(e) => setStatusFilter(e.currentTarget.value)}>
            <option value="">All</option>
            <option value="submitted">Submitted</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full text-left text-sm">
            <thead><tr class="border-b border-stroke text-text-secondary">
              <th class="py-2 pr-3">Employee</th><th class="py-2 pr-3">Type</th><th class="py-2 pr-3">Dates</th>
              <th class="py-2 pr-3">Days</th><th class="py-2 pr-3">Notes</th><th class="py-2 pr-3">Files</th><th class="py-2 pr-3">Status</th><th class="py-2">Actions</th>
            </tr></thead>
            <tbody>
              <For each={requests.data ?? []} fallback={<tr><td colSpan={8} class="py-3 text-text-secondary">No requests.</td></tr>}>
                {(r) => (
                  <tr class="border-b border-slate-100">
                    <td class="py-2 pr-3">{r.employee_no} — {r.employee_name}</td>
                    <td class="py-2 pr-3">{r.leave_code}</td>
                    <td class="py-2 pr-3">{r.date_from} → {r.date_to}</td>
                    <td class="py-2 pr-3">{r.days}</td>
                    <td class="py-2 pr-3">{r.notes || r.reason || "—"}</td>
                    <td class="py-2 pr-3">{r.file_count ?? 0}</td>
                    <td class="py-2 pr-3">{r.status}</td>
                    <td class="py-2">
                      <ActivityHistoryLink module="hr" targetType="hr_leave_request" targetId={r.id} class="mr-2 text-xs" />
                      <Show when={r.status === "submitted"}>
                        <button type="button" class="mr-2 text-xs text-brand-700" onClick={() => void act(r.id, "approve")}>Approve</button>
                        <button type="button" class="mr-2 text-xs text-amber-700" onClick={() => void act(r.id, "reject")}>Reject</button>
                        <button type="button" class="text-xs text-text-secondary" onClick={() => void act(r.id, "cancel")}>Cancel</button>
                      </Show>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </section>

      <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h2 class="mb-3 text-lg font-medium">Balances</h2>
        <div class="overflow-x-auto">
          <table class="min-w-full text-left text-sm">
            <thead><tr class="border-b border-stroke text-text-secondary">
              <th class="py-2 pr-3">Employee</th><th class="py-2 pr-3">Type</th><th class="py-2 pr-3">Year</th>
              <th class="py-2 pr-3">Available</th><th class="py-2 pr-3">Used</th><th class="py-2">Reserved</th>
            </tr></thead>
            <tbody>
              <For each={balances.data ?? []} fallback={<tr><td colSpan={6} class="py-3 text-text-secondary">No balances — run Accrue.</td></tr>}>
                {(b) => (
                  <tr class="border-b border-slate-100">
                    <td class="py-2 pr-3">{b.employee_no} — {b.employee_name}</td>
                    <td class="py-2 pr-3">{b.leave_code} {b.leave_name}</td>
                    <td class="py-2 pr-3">{b.balance_year}</td>
                    <td class="py-2 pr-3">{b.available}</td>
                    <td class="py-2 pr-3">{b.used}</td>
                    <td class="py-2">{b.reserved}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </section>
    </HrLayout>
  );
}
