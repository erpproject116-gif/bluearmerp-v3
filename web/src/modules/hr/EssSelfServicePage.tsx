import { createSignal, createResource, For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { apiFetch } from "../../shared/api";
import { ProtectedRoute } from "../../shared/ProtectedRoute";
import { LoadingText } from "../../shared/LoadingText";
import { formatPeso } from "../../shared/money";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";

type EssMe = {
  id: number;
  employee_no: string;
  full_name: string;
  department: string;
  job_title: string;
};

type EssPayslip = {
  id: number;
  period_label?: string;
  gross_pay: number;
  deductions: number;
  net_pay: number;
  status: string;
};

function EssSelfServiceView() {
  const toast = useToast();
  const [me] = createResource(async () => {
    const res = await apiFetch<EssMe>("/api/v1/hr/ess/me");
    if (!res.success || !res.data) return null;
    return res.data;
  });
  const [payslips] = createResource(async () => {
    const res = await apiFetch<EssPayslip[]>("/api/v1/hr/ess/payslips");
    if (!res.success) return [];
    return res.data ?? [];
  });
  const [balances, { refetch: refetchBal }] = createResource(async () => {
    const res = await apiFetch<{ leave_code: string; leave_name: string; available: number }[]>("/api/v1/hr/ess/leave-balances");
    return res.success ? res.data ?? [] : [];
  });
  const [leaveReqs, { refetch: refetchLeave }] = createResource(async () => {
    const res = await apiFetch<{ id: number; leave_code?: string; date_from: string; date_to: string; days: number; status: string }[]>(
      "/api/v1/hr/ess/leave-requests",
    );
    return res.success ? res.data ?? [] : [];
  });
  const [discipline] = createResource(async () => {
    const res = await apiFetch<{ id: number; case_no: string; case_type: string; status: string; subject: string }[]>("/api/v1/hr/ess/discipline");
    return res.success ? res.data ?? [] : [];
  });
  const [onboarding] = createResource(async () => {
    const res = await apiFetch<{ case: { id: number; status: string } | null; tasks: { id: number; title: string; status: string }[] }>(
      "/api/v1/hr/ess/onboarding",
    );
    return res.success ? res.data : null;
  });
  const [learning] = createResource(async () => {
    const res = await apiFetch<{ id: number; course_title: string; status: string; body_markdown?: string }[]>("/api/v1/hr/ess/learning");
    return res.success ? res.data ?? [] : [];
  });
  const [docs] = createResource(async () => {
    const res = await apiFetch<{ id: number; doc_type: string; title: string }[]>("/api/v1/hr/ess/documents");
    return res.success ? res.data ?? [] : [];
  });

  const [typeId, setTypeId] = createSignal("");
  const [from, setFrom] = createSignal("");
  const [to, setTo] = createSignal("");
  const [reason, setReason] = createSignal("");
  const [leaveTypes] = createResource(async () => {
    const res = await apiFetch<{ id: number; code: string; name: string }[]>("/api/v1/hr/ess/leave-types");
    return res.success ? res.data ?? [] : [];
  });

  const submitLeave = async () => {
    if (!typeId() || !from() || !to()) {
      toast.warning("Leave type and dates required.");
      return;
    }
    const res = await apiFetch("/api/v1/hr/ess/leave-requests", {
      method: "POST",
      body: JSON.stringify({ leave_type_id: Number(typeId()), date_from: from(), date_to: to(), reason: reason() }),
    });
    if (!res.success) {
      toast.warning(res.message ?? "Submit failed.");
      return;
    }
    toast.success("Leave submitted.");
    void refetchLeave();
    void refetchBal();
  };

  return (
    <div class="mx-auto max-w-3xl p-6">
      <h1 class="mb-1 text-2xl font-semibold text-text-primary">My HR</h1>
      <p class="mb-6 text-sm text-text-secondary">Profile, payslips, leave, learning, discipline, and onboarding.</p>

      <Show when={me.loading}><LoadingText /></Show>
      <Show when={!me.loading && me() === null}>
        <p class="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          No employee profile linked to your user. Ask HR to set user_id on your employee record.
        </p>
      </Show>
      <Show when={me()}>
        {(e) => (
          <section class="mb-6 rounded-xl border border-stroke bg-white p-4 shadow-sm">
            <h2 class="text-sm font-semibold uppercase tracking-wide text-text-secondary">Profile</h2>
            <p class="mt-2 text-lg font-medium">{e().full_name}</p>
            <p class="text-sm text-text-secondary">
              {e().employee_no} · {e().job_title || "—"} · {e().department || "—"}
            </p>
            <button
              type="button"
              class="mt-2 text-sm text-brand-700 hover:underline"
              onClick={() => void apiFetch("/api/v1/hr/ess/tax-certificate").then((res) => {
                if (!res.success) toast.warning(res.message ?? "Failed.");
                else toast.success("Tax certificate pack loaded — see network/response for YTD fields.");
                console.info("tax-certificate", res.data);
              })}
            >
              Load tax certificate pack
            </button>
          </section>
        )}
      </Show>

      <section class="mb-6 rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">Leave balances</h2>
        <For each={balances() ?? []} fallback={<p class="text-sm text-text-secondary">No balances yet.</p>}>
          {(b) => (
            <p class="text-sm">{b.leave_code} {b.leave_name}: <span class="font-medium">{b.available}</span> days</p>
          )}
        </For>
        <div class="mt-4 grid gap-2 sm:grid-cols-2">
          <Field label="Leave type">
            <select class={inputClass} value={typeId()} onChange={(e) => setTypeId(e.currentTarget.value)}>
              <option value="">Select…</option>
              <For each={leaveTypes() ?? []}>{(t) => <option value={t.id}>{t.code} — {t.name}</option>}</For>
            </select>
          </Field>
          <Field label="From"><input type="date" class={inputClass} value={from()} onInput={(e) => setFrom(e.currentTarget.value)} /></Field>
          <Field label="To"><input type="date" class={inputClass} value={to()} onInput={(e) => setTo(e.currentTarget.value)} /></Field>
          <Field label="Reason"><input class={inputClass} value={reason()} onInput={(e) => setReason(e.currentTarget.value)} /></Field>
        </div>
        <button type="button" class="mt-2 rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white" onClick={() => void submitLeave()}>
          File leave
        </button>
        <ul class="mt-3 divide-y divide-stroke text-sm">
          <For each={leaveReqs() ?? []}>
            {(r) => (
              <li class="py-1">{r.leave_code} {r.date_from}→{r.date_to} · {r.days}d · {r.status}</li>
            )}
          </For>
        </ul>
      </section>

      <section class="mb-6 rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">Payslips</h2>
        <Show when={(payslips() ?? []).length === 0 && !payslips.loading}>
          <p class="text-sm text-text-secondary">No posted payslips yet.</p>
        </Show>
        <ul class="divide-y divide-stroke">
          <For each={payslips() ?? []}>
            {(p) => (
              <li class="flex items-center justify-between py-2 text-sm">
                <div>
                  <p class="font-medium">{p.period_label || `Payslip #${p.id}`}</p>
                  <p class="text-text-secondary">Gross {formatPeso(p.gross_pay)} · Net {formatPeso(p.net_pay)}</p>
                </div>
                <A href={`/app/hr/payslips/${p.id}/print`} class="text-brand-700 hover:underline" target="_blank">View</A>
              </li>
            )}
          </For>
        </ul>
      </section>

      <section class="mb-6 rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">My onboarding</h2>
        <Show when={!onboarding()?.case}>
          <p class="text-sm text-text-secondary">No hire onboarding case.</p>
        </Show>
        <For each={onboarding()?.tasks ?? []}>
          {(t) => <p class="text-sm">{t.title} · {t.status}</p>}
        </For>
      </section>

      <section class="mb-6 rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">My learning</h2>
        <For each={learning() ?? []} fallback={<p class="text-sm text-text-secondary">No assignments.</p>}>
          {(c) => <p class="text-sm">{c.course_title} · {c.status}</p>}
        </For>
      </section>

      <section class="mb-6 rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">Discipline</h2>
        <For each={discipline() ?? []} fallback={<p class="text-sm text-text-secondary">No open cases.</p>}>
          {(c) => (
            <div class="mb-2 flex items-center justify-between text-sm">
              <span>{c.case_no} · {c.case_type} · {c.subject} · {c.status}</span>
              <button
                type="button"
                class="text-xs text-brand-700"
                onClick={() => void apiFetch(`/api/v1/hr/ess/discipline/${c.id}/acknowledge`, { method: "POST", body: "{}" }).then((res) => {
                  if (!res.success) toast.warning(res.message ?? "Failed.");
                  else toast.success("Acknowledged.");
                })}
              >
                Acknowledge
              </button>
            </div>
          )}
        </For>
      </section>

      <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">201 documents (read-only)</h2>
        <For each={docs() ?? []} fallback={<p class="text-sm text-text-secondary">No documents.</p>}>
          {(d) => <p class="text-sm">{d.doc_type}: {d.title}</p>}
        </For>
      </section>
    </div>
  );
}

export default function EssSelfServicePage() {
  return (
    <ProtectedRoute>
      <EssSelfServiceView />
    </ProtectedRoute>
  );
}
