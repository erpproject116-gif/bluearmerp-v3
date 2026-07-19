import { createSignal, For, Show } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { useEmployees } from "../../shared/useHr";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
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
};

export default function LeavePage() {
  const toast = useToast();
  const qc = useQueryClient();
  const emps = useEmployees(() => ({ page: 1, pageSize: 200, status: "active" }));
  const [empId, setEmpId] = createSignal("");
  const [typeId, setTypeId] = createSignal("");
  const [from, setFrom] = createSignal("");
  const [to, setTo] = createSignal("");
  const [reason, setReason] = createSignal("");
  const [statusFilter, setStatusFilter] = createSignal("submitted");

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
    const res = await apiFetch("/api/v1/hr/leave-requests", {
      method: "POST",
      body: JSON.stringify({
        employee_id: Number(empId()), leave_type_id: Number(typeId()),
        date_from: from(), date_to: to(), reason: reason(), status: "submitted",
      }),
    });
    if (!res.success) return toast.warning(res.message ?? "Submit failed.");
    toast.success("Leave request submitted.");
    setReason("");
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

      <section class="mb-6 rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h2 class="mb-3 text-lg font-medium">New request</h2>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Employee">
            <select class={inputClass} value={empId()} onChange={(e) => setEmpId(e.currentTarget.value)}>
              <option value="">Select…</option>
              <For each={emps.data?.rows ?? []}>{(e) => <option value={e.id}>{e.employee_no} — {e.full_name}</option>}</For>
            </select>
          </Field>
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
          <Field label="Reason"><input class={inputClass} value={reason()} onInput={(e) => setReason(e.currentTarget.value)} /></Field>
        </div>
        <button type="button" class="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm text-white" onClick={() => void submit()}>Submit leave</button>
      </section>

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
              <th class="py-2 pr-3">Days</th><th class="py-2 pr-3">Status</th><th class="py-2">Actions</th>
            </tr></thead>
            <tbody>
              <For each={requests.data ?? []} fallback={<tr><td colSpan={6} class="py-3 text-text-secondary">No requests.</td></tr>}>
                {(r) => (
                  <tr class="border-b border-slate-100">
                    <td class="py-2 pr-3">{r.employee_no} — {r.employee_name}</td>
                    <td class="py-2 pr-3">{r.leave_code}</td>
                    <td class="py-2 pr-3">{r.date_from} → {r.date_to}</td>
                    <td class="py-2 pr-3">{r.days}</td>
                    <td class="py-2 pr-3">{r.status}</td>
                    <td class="py-2">
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
