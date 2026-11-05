import { createSignal, createResource, For, onCleanup, onMount, Show } from "solid-js";
import { A } from "@solidjs/router";
import { apiFetch } from "../../shared/api";
import { ProtectedRoute } from "../../shared/ProtectedRoute";
import { LoadingText } from "../../shared/LoadingText";
import { formatPeso } from "../../shared/money";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";

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
    <HrLayout>
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
          <section class="mb-6 rounded-xl border border-stroke bg-surface p-4 shadow-sm">
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

      <section class="mb-6 rounded-xl border border-stroke bg-surface p-4 shadow-sm">
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

      <section class="mb-6 rounded-xl border border-stroke bg-surface p-4 shadow-sm">
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

      <section class="mb-6 rounded-xl border border-stroke bg-surface p-4 shadow-sm">
        <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">My onboarding</h2>
        <Show when={!onboarding()?.case}>
          <p class="text-sm text-text-secondary">No hire onboarding case.</p>
        </Show>
        <For each={onboarding()?.tasks ?? []}>
          {(t) => <p class="text-sm">{t.title} · {t.status}</p>}
        </For>
      </section>

      <section class="mb-6 rounded-xl border border-stroke bg-surface p-4 shadow-sm">
        <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">My learning</h2>
        <For each={learning() ?? []} fallback={<p class="text-sm text-text-secondary">No assignments.</p>}>
          {(c) => <p class="text-sm">{c.course_title} · {c.status}</p>}
        </For>
      </section>

      <section class="mb-6 rounded-xl border border-stroke bg-surface p-4 shadow-sm">
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

      <section class="rounded-xl border border-stroke bg-surface p-4 shadow-sm">
        <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">201 documents (read-only)</h2>
        <For each={docs() ?? []} fallback={<p class="text-sm text-text-secondary">No documents.</p>}>
          {(d) => <p class="text-sm">{d.doc_type}: {d.title}</p>}
        </For>
      </section>

      <EssPunch />
      <EssRequests />
    </div>
    </HrLayout>
  );
}

function EssPunch() {
  const toast = useToast();
  const [pin, setPin] = createSignal("");
  const [newPin, setNewPin] = createSignal("");
  const [currentPin, setCurrentPin] = createSignal("");
  const [selfieName, setSelfieName] = createSignal("");
  const [selfie, setSelfie] = createSignal("");
  const [rows, { refetch }] = createResource(async () => (await apiFetch<{ id: number; punched_at: string; has_selfie: boolean }[]>("/api/v1/hr/ess/punches")).data ?? []);
  const sendPunch = async (body: { idempotency_key: string; pin: string; selfie_name: string; selfie_base64: string }) => {
    localStorage.setItem("hr-punch-pending", JSON.stringify(body));
    try {
      const res = await apiFetch("/api/v1/hr/ess/punches", { method: "POST", body: JSON.stringify(body) });
      if (!res.success) {
        localStorage.removeItem("hr-punch-pending");
        toast.warning(res.message ?? "Could not save the punch.");
        return;
      }
      localStorage.removeItem("hr-punch-pending");
      toast.success("Punch saved.");
      void refetch();
    } catch {
      toast.warning("Saved on this phone. It will send when the connection returns.");
    }
  };
  onMount(() => {
    const retry = () => {
      const raw = localStorage.getItem("hr-punch-pending");
      if (!raw) return;
      void sendPunch(JSON.parse(raw));
    };
    window.addEventListener("online", retry);
    onCleanup(() => window.removeEventListener("online", retry));
  });
  const punch = async () => {
    const pending = localStorage.getItem("hr-punch-pending");
    const body = pending
      ? JSON.parse(pending) as { idempotency_key: string; pin: string; selfie_name: string; selfie_base64: string }
      : { idempotency_key: crypto.randomUUID(), pin: pin(), selfie_name: selfieName(), selfie_base64: selfie() };
    await sendPunch(body);
  };
  const savePin = async () => {
    const res = await apiFetch("/api/v1/hr/ess/punch-pin", {
      method: "PUT",
      body: JSON.stringify({ current_pin: currentPin(), pin: newPin() }),
    });
    if (!res.success) return toast.warning(res.message ?? "Could not save the PIN.");
    toast.success("PIN saved.");
  };
  return (
    <section class="rounded-xl border border-stroke bg-surface p-4 shadow-sm">
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-text-secondary">Clock-in</h2>
      <p class="mb-3 text-sm text-text-secondary">A punch is stored for you. It does not change attendance or pay. If the phone is offline, press Clock in again when you are back; the same key is sent once.</p>
      <div class="mb-3 flex flex-wrap gap-2">
        <input class={inputClass + " w-32"} type="password" placeholder="PIN" value={pin()} onInput={(e) => setPin(e.currentTarget.value)} />
        <input type="file" accept="image/*" onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (!file) return;
          setSelfieName(file.name);
          const reader = new FileReader();
          reader.onload = () => {
            const text = String(reader.result ?? "");
            setSelfie(text.includes(",") ? text.split(",")[1] : text);
          };
          reader.readAsDataURL(file);
        }} />
        <button type="button" class="rounded-lg bg-brand-600 px-3 py-2 text-sm text-white" onClick={() => void punch()}>Clock in</button>
      </div>
      <div class="mb-3 flex flex-wrap gap-2">
        <input class={inputClass + " w-32"} type="password" placeholder="Current PIN" value={currentPin()} onInput={(e) => setCurrentPin(e.currentTarget.value)} />
        <input class={inputClass + " w-32"} type="password" placeholder="New PIN" value={newPin()} onInput={(e) => setNewPin(e.currentTarget.value)} />
        <button type="button" class="rounded-lg border border-stroke px-3 py-2 text-sm" onClick={() => void savePin()}>Save PIN</button>
      </div>
      <For each={rows() ?? []} fallback={<p class="text-sm text-text-secondary">No punches yet.</p>}>
        {(row) => <p class="text-sm">{row.punched_at}{row.has_selfie ? " · selfie" : ""}</p>}
      </For>
    </section>
  );
}

function EssRequests() {
  const toast = useToast();
  const [kind, setKind] = createSignal("loan");
  const [details, setDetails] = createSignal("");
  const [rows, { refetch }] = createResource(async () => (await apiFetch<{ id: number; kind: string; status: string; details: string }[]>("/api/v1/hr/ess/requests")).data ?? []);
  const submit = async () => {
    const res = await apiFetch("/api/v1/hr/ess/requests", { method: "POST", body: JSON.stringify({ kind: kind(), details: details() }) });
    if (!res.success) return toast.warning(res.message ?? "Could not submit the request.");
    toast.success("Request submitted.");
    setDetails("");
    void refetch();
  };
  return (
    <section class="mt-6 rounded-xl border border-stroke bg-surface p-4 shadow-sm">
      <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">Requests</h2>
      <Field label="Kind">
        <select class={inputClass} value={kind()} onChange={(e) => setKind(e.currentTarget.value)}>
          <option value="loan">Loan</option>
          <option value="salary_advance">Salary advance</option>
          <option value="pay_question">Pay question</option>
          <option value="certificate">Certificate</option>
          <option value="resignation">Resignation</option>
        </select>
      </Field>
      <Field label="Details"><textarea class={inputClass} value={details()} onInput={(e) => setDetails(e.currentTarget.value)} /></Field>
      <button type="button" class="mt-2 rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white" onClick={() => void submit()}>Submit request</button>
      <For each={rows() ?? []}>{(row) => <p class="mt-2 text-sm">{row.kind} · {row.status} · {row.details}</p>}</For>
    </section>
  );
}

export default function EssSelfServicePage() {
  return (
    <ProtectedRoute>
      <EssSelfServiceView />
    </ProtectedRoute>
  );
}
