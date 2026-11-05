import { createSignal, For, Show } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiBase, apiFetch, getAccessToken } from "../../shared/api";
import { getActiveBranchIdCurrent, getActiveTenantId } from "../../shared/activeContext";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { HrCasesTabs } from "./HrCasesTabs";
import { HrLayout } from "./HrLayout";
import { HrBadge, HrEmpty, HrPageHead, HrTcard } from "./HrUi";

type Alert = {
  id: number;
  employee_id: number;
  employee_no?: string;
  employee_name?: string;
  alert_code: string;
  message: string;
  occurrence_count: number;
  discipline_case_id?: number | null;
  reason?: string;
  remarks?: string;
  status?: string;
  window_start?: string;
  window_end?: string;
};

type ReportRow = {
  employee_id: number;
  employee_no: string;
  employee_name: string;
  department: string;
  absent_days: number;
  awol_days: number;
  late_days: number;
  leave_days: number;
};

type AlertAction = "acknowledge" | "discipline" | "dismiss";

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

export default function AbsenteeismPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [from, setFrom] = createSignal(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = createSignal(new Date().toISOString().slice(0, 10));
  const [detail, setDetail] = createSignal<Alert | null>(null);
  const [action, setAction] = createSignal<AlertAction>("acknowledge");
  const [remarks, setRemarks] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  const alerts = createQuery(() => ({
    queryKey: ["hr-absence-alerts"],
    queryFn: async () => (await apiFetch<Alert[]>("/api/v1/hr/absence-alerts?status=open")).data ?? [],
  }));
  const report = createQuery(() => ({
    queryKey: ["hr-absenteeism-report", from(), to()],
    queryFn: async () => {
      const res = await apiFetch<{ rows: ReportRow[] }>(`/api/v1/hr/absenteeism-report?from=${from()}&to=${to()}`);
      return res.data?.rows ?? [];
    },
  }));

  const evaluate = async () => {
    setBusy(true);
    const res = await apiFetch<{ alerts_created: number }>("/api/v1/hr/absence-alerts/evaluate", { method: "POST", body: "{}" });
    setBusy(false);
    if (!res.success) return toast.warning(res.message ?? "Failed.");
    toast.success(`Created ${res.data?.alerts_created ?? 0} alert(s).`);
    void qc.invalidateQueries({ queryKey: ["hr-absence-alerts"] });
  };

  const createDiscipline = async (a: Alert) => {
    const res = await apiFetch("/api/v1/hr/discipline/cases", {
      method: "POST",
      body: JSON.stringify({
        employee_id: a.employee_id,
        case_type: "nte",
        subject: `Absenteeism: ${a.alert_code}`,
        details: a.message,
        absence_alert_id: a.id,
      }),
    });
    if (!res.success) return toast.warning(res.message ?? "Could not open draft.");
    toast.success("Discipline draft created.");
    void qc.invalidateQueries({ queryKey: ["hr-absence-alerts"] });
  };

  const openAlert = (a: Alert) => {
    setDetail(a);
    setAction(a.discipline_case_id ? "acknowledge" : "acknowledge");
    setRemarks(a.remarks ?? "");
  };

  const saveAlert = async () => {
    const a = detail();
    if (!a) return;
    if (!remarks().trim()) return toast.warning("Remarks are required.");
    if (action() === "dismiss") {
      return toast.warning("Dismiss is not available yet.");
    }
    setBusy(true);
    const patched = await apiFetch(`/api/v1/hr/absence-alerts/${a.id}`, {
      method: "PATCH",
      body: JSON.stringify({ reason: a.reason ?? "", remarks: remarks().trim() }),
    });
    if (!patched.success) {
      setBusy(false);
      return toast.warning(patched.message ?? "Could not save remarks.");
    }
    if (action() === "discipline") {
      if (a.discipline_case_id) {
        setBusy(false);
        toast.success("Remarks saved. Discipline case already linked.");
        setDetail(null);
        void qc.invalidateQueries({ queryKey: ["hr-absence-alerts"] });
        return;
      }
      await createDiscipline(a);
    } else {
      const ack = await apiFetch(`/api/v1/hr/absence-alerts/${a.id}/acknowledge`, { method: "POST", body: "{}" });
      if (!ack.success) {
        setBusy(false);
        return toast.warning(ack.message ?? "Could not acknowledge.");
      }
      toast.success("Alert acknowledged.");
    }
    setBusy(false);
    setDetail(null);
    void qc.invalidateQueries({ queryKey: ["hr-absence-alerts"] });
  };

  const upload = async (alertId: number, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${apiBase}/api/v1/hr/absence-alerts/${alertId}/files`, {
      method: "POST",
      headers: await authHeaders(),
      body: fd,
    });
    if (!res.ok) return toast.warning("File upload failed.");
    toast.success("File stored on the alert.");
  };

  return (
    <HrLayout>
      <HrCasesTabs />
      <HrPageHead
        title="Absenteeism"
        subtitle="Alerts from DTR against your absence rules."
        actions={
          <button type="button" class="hr-btn" disabled={busy()} onClick={() => void evaluate()}>
            Evaluate thresholds
          </button>
        }
      />

      <div class="grid gap-4 lg:grid-cols-2">
        <section class="hr-w s12" aria-label="Open alerts">
          <header>
            <h3>Open alerts</h3>
            <span class="grow" />
            <HrBadge tone={(alerts.data ?? []).length > 0 ? "info" : "neutral"}>{(alerts.data ?? []).length}</HrBadge>
          </header>
          <ul class="hr-aq">
            <For each={alerts.data ?? []} fallback={<li><div class="hr-wempty" style={{ width: "100%" }}>No open alerts.</div></li>}>
              {(a) => (
                <li>
                  <span class="t">
                    <b>{a.employee_name || a.employee_no}</b>
                    <span class="xs">
                      {a.message || a.alert_code}
                      {a.occurrence_count ? ` · ${a.occurrence_count} occurrence(s)` : ""}
                    </span>
                  </span>
                  <HrBadge tone="info">Open</HrBadge>
                  <button type="button" class="hr-btn hr-btn-sm" onClick={() => openAlert(a)}>
                    Open
                  </button>
                  <Show when={!a.discipline_case_id}>
                    <button type="button" class="hr-btn hr-btn-sm" disabled={busy()} onClick={() => void createDiscipline(a)}>
                      Create discipline draft
                    </button>
                  </Show>
                </li>
              )}
            </For>
          </ul>
          <p class="hr-muted mt-2 px-1 pb-2">
            Create a workplace problem from an alert
          </p>
        </section>

        <HrTcard>
          <div class="p-3">
            <h3 class="mb-3 text-sm font-semibold">Period report</h3>
            <div class="mb-3 grid gap-3 sm:grid-cols-2">
              <Field label="From">
                <input type="date" class={inputClass} value={from()} onInput={(e) => setFrom(e.currentTarget.value)} />
              </Field>
              <Field label="To">
                <input type="date" class={inputClass} value={to()} onInput={(e) => setTo(e.currentTarget.value)} />
              </Field>
            </div>
            <div class="hr-tbl-wrap">
              <table class="hr-tbl">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Dept</th>
                    <th class="num">Absent</th>
                    <th class="num">AWOL</th>
                    <th class="num">Short</th>
                    <th class="num">Leave</th>
                  </tr>
                </thead>
                <tbody>
                  <For
                    each={report.data ?? []}
                    fallback={
                      <tr>
                        <td colspan="6">
                          <HrEmpty title="No matches" hint="Try a different date range." />
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
                        <td>{r.department || "—"}</td>
                        <td class="num">{r.absent_days}</td>
                        <td class="num">{r.awol_days}</td>
                        <td class="num">{r.late_days}</td>
                        <td class="num">{r.leave_days}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </div>
        </HrTcard>
      </div>

      <Show when={detail()}>
        {(a) => (
          <div
            class="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4"
            role="dialog"
            aria-modal="true"
            aria-label={`Absence alert · ${a().employee_name ?? ""}`}
          >
            <div class="max-h-[90vh] w-full max-w-md overflow-auto rounded-lg border border-stroke bg-surface p-4 shadow-lg">
              <div class="mb-3 flex items-center justify-between gap-2">
                <h2 class="text-sm font-semibold">Absence alert · {a().employee_name}</h2>
                <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setDetail(null)}>
                  ✕
                </button>
              </div>
              <ol class="mb-3 space-y-2 text-sm">
                <li>
                  <b>{a().message || a().alert_code}</b>
                  <div class="hr-muted">
                    Rule: {a().alert_code}
                    {a().occurrence_count ? ` · ${a().occurrence_count} occurrence(s)` : ""}
                  </div>
                  <Show when={a().window_start || a().window_end}>
                    <div class="hr-muted">
                      Window: {a().window_start || "—"} → {a().window_end || "—"}
                    </div>
                  </Show>
                </li>
              </ol>
              <Field label="Action">
                <select class={inputClass} value={action()} onChange={(e) => setAction(e.currentTarget.value as AlertAction)}>
                  <option value="acknowledge">Acknowledge</option>
                  <option value="discipline">Create discipline case</option>
                  <option value="dismiss" disabled>
                    Dismiss
                  </option>
                </select>
              </Field>
              <label class="mt-3 block text-sm">
                <span class="mb-1 block font-medium">
                  Remarks <span class="text-red-700">*</span>
                </span>
                <textarea class={inputClass} rows={3} value={remarks()} onInput={(e) => setRemarks(e.currentTarget.value)} />
              </label>
              <Field label="File">
                <input
                  type="file"
                  class={inputClass}
                  onChange={(e) => {
                    const f = e.currentTarget.files?.[0];
                    e.currentTarget.value = "";
                    if (f) void upload(a().id, f);
                  }}
                />
              </Field>
              <div class="mt-4 flex flex-wrap justify-end gap-2">
                <button type="button" class="hr-btn" onClick={() => setDetail(null)}>
                  Cancel
                </button>
                <button type="button" class="hr-btn hr-btn-primary" disabled={busy()} onClick={() => void saveAlert()}>
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>
    </HrLayout>
  );
}
