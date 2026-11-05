import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";
import { HrBadge, HrEmpty, HrPageHead, HrPlanned, HrTcard, type HrBadgeTone } from "./HrUi";

type RequestRow = {
  id: number;
  employee_name: string;
  kind: string;
  status: string;
  details: string;
  created_at: string;
};

type DecisionMode = "approve" | "reject" | "kind" | null;

const KINDS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "loan", label: "Loan" },
  { value: "salary_advance", label: "Salary advance" },
  { value: "pay_question", label: "Pay question" },
  { value: "certificate", label: "Certificate" },
  { value: "resignation", label: "Resignation" },
];

function kindLabel(value: string) {
  return KINDS.find((k) => k.value === value)?.label ?? value.replace(/_/g, " ");
}

function statusLabel(status: string) {
  if (status === "pending") return "Pending";
  if (status === "closed") return "Closed";
  if (!status) return "—";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusTone(status: string): HrBadgeTone {
  if (status === "pending") return "warning";
  if (status === "closed") return "success";
  if (status === "rejected") return "neutral";
  return "neutral";
}

function formatSubmitted(iso: string) {
  if (!iso) return "—";
  return iso.slice(0, 10) || iso;
}

export default function RequestsPage() {
  const toast = useToast();
  const [kind, setKind] = createSignal("");
  const [status, setStatus] = createSignal("");
  const [search, setSearch] = createSignal("");
  const [mode, setMode] = createSignal<DecisionMode>(null);
  const [active, setActive] = createSignal<RequestRow | null>(null);
  const [note, setNote] = createSignal("");
  const [decision, setDecision] = createSignal<"approve" | "reject">("approve");
  const [amount, setAmount] = createSignal("");
  const [terms, setTerms] = createSignal("");
  const [certType, setCertType] = createSignal("COE");
  const [effectiveDate, setEffectiveDate] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  const [requests, { refetch }] = createResource(
    () => `${kind()}|${status()}`,
    async () => {
      const q = new URLSearchParams();
      if (kind()) q.set("kind", kind());
      if (status()) q.set("status", status());
      const res = await apiFetch<RequestRow[]>(`/api/v1/hr/worker-requests?${q}`);
      return res.data ?? [];
    },
  );

  const [pendingAll, { refetch: refetchPending }] = createResource(async () => {
    const res = await apiFetch<RequestRow[]>("/api/v1/hr/worker-requests?status=pending");
    return res.data ?? [];
  });

  const rows = createMemo(() => {
    const q = search().trim().toLowerCase();
    return (requests() ?? []).filter((row) => {
      if (!q) return true;
      return (
        (row.employee_name || "").toLowerCase().includes(q) ||
        (row.details || "").toLowerCase().includes(q) ||
        kindLabel(row.kind).toLowerCase().includes(q)
      );
    });
  });

  const pendingCount = (k: string) => (pendingAll() ?? []).filter((r) => r.kind === k).length;

  const openApprove = (row: RequestRow) => {
    setActive(row);
    setNote("");
    setMode("approve");
  };

  const openReject = (row: RequestRow) => {
    setActive(row);
    setNote("");
    setMode("reject");
  };

  const openKind = (k: string) => {
    setKind(k);
    setStatus("pending");
    void (async () => {
      const res = await apiFetch<RequestRow[]>(`/api/v1/hr/worker-requests?kind=${encodeURIComponent(k)}&status=pending`);
      const list = res.data ?? [];
      if (list.length === 0) {
        toast.warning(`No pending ${kindLabel(k).toLowerCase()} requests.`);
        return;
      }
      const row = list[0]!;
      setActive(row);
      setDecision("approve");
      setNote("");
      setAmount("");
      setTerms("");
      setCertType("COE");
      setEffectiveDate("");
      setMode("kind");
    })();
  };

  const closeRequest = async (row: RequestRow) => {
    const res = await apiFetch(`/api/v1/hr/worker-requests/${row.id}`, { method: "PATCH", body: "{}" });
    if (!res.success) {
      toast.warning(res.message ?? "Could not close the request.");
      return false;
    }
    return true;
  };

  const confirmApprove = async () => {
    const row = active();
    if (!row) return;
    setBusy(true);
    const ok = await closeRequest(row);
    setBusy(false);
    if (!ok) return;
    toast.success("Request approved (closed).");
    setMode(null);
    setActive(null);
    void refetch();
    void refetchPending();
  };

  const confirmReject = async () => {
    if (!note().trim()) return toast.warning("Reason is required.");
    // Backend only supports close (no rejected status). Gate with clear Planned messaging.
    toast.warning("Reject status needs backend support — request was not changed.");
  };

  const saveKindDecision = async () => {
    const row = active();
    if (!row) return;
    if (!note().trim()) return toast.warning("Remarks are required.");
    if (decision() === "reject") {
      toast.warning("Reject status needs backend support — request was not changed.");
      return;
    }
    setBusy(true);
    const ok = await closeRequest(row);
    setBusy(false);
    if (!ok) return;
    toast.success(`${kindLabel(row.kind)} approved (closed).`);
    setMode(null);
    setActive(null);
    void refetch();
    void refetchPending();
  };

  return (
    <HrLayout>
      <div class="hr-crumb">HR &amp; Payroll › HR cases › Requests</div>
      <HrPageHead
        title="Requests"
        subtitle="Employee requests from self-service: loans, salary advances, pay questions, certificates, resignations."
      />

      <section class="hr-w s12 mb-4" aria-label="Approve or reject by request kind">
        <header>
          <h3>Approve or reject by request kind</h3>
          <span class="grow" />
        </header>
        <div class="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" role="navigation" aria-label="Request kinds">
          <For each={KINDS.filter((k) => k.value !== "")}>
            {(k) => (
              <button
                type="button"
                class="hr-btn flex min-h-[44px] w-full items-center justify-between gap-2 px-3 text-left text-sm font-medium"
                title={`Open the next pending ${k.label.toLowerCase()} for a decision`}
                onClick={() => openKind(k.value)}
              >
                <span>{k.label}…</span>
                <Show when={pendingCount(k.value) > 0} fallback={<span class="hr-muted text-xs">0</span>}>
                  <HrBadge tone="warning">{pendingCount(k.value)}</HrBadge>
                </Show>
              </button>
            )}
          </For>
        </div>
        <p class="hr-muted px-3 pb-3">
          Tap a kind to open the next pending request. Reject status <HrPlanned /> — Approve closes with the live API.
        </p>
      </section>

      <HrTcard
        toolbar={
          <>
            <div class="hr-seg" role="group" aria-label="Request kind">
              <For each={KINDS}>
                {(k) => (
                  <button type="button" classList={{ on: kind() === k.value }} onClick={() => setKind(k.value)}>
                    {k.label}
                  </button>
                )}
              </For>
            </div>
            <select
              class="rounded-lg border border-stroke bg-surface px-2 text-sm"
              aria-label="Status"
              value={status()}
              onChange={(e) => setStatus(e.currentTarget.value)}
            >
              <option value="">Status: All</option>
              <option value="pending">Pending</option>
              <option value="closed">Closed</option>
            </select>
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
                <th>Kind</th>
                <th>Details</th>
                <th>Status</th>
                <th>Submitted</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              <For
                each={rows()}
                fallback={
                  <tr>
                    <td colspan="6">
                      <HrEmpty title="No matches" hint="Try a different search or clear the filters." />
                    </td>
                  </tr>
                }
              >
                {(row) => (
                  <tr>
                    <td class="font-semibold">{row.employee_name}</td>
                    <td>
                      <HrBadge tone="neutral">{kindLabel(row.kind)}</HrBadge>
                    </td>
                    <td>{row.details || "—"}</td>
                    <td>
                      <HrBadge tone={statusTone(row.status)}>{statusLabel(row.status)}</HrBadge>
                    </td>
                    <td>{formatSubmitted(row.created_at)}</td>
                    <td>
                      <Show when={row.status === "pending"}>
                        <div class="flex flex-wrap gap-1">
                          <button type="button" class="hr-btn hr-btn-primary hr-btn-sm" onClick={() => openApprove(row)}>
                            Approve
                          </button>
                          <button type="button" class="hr-btn hr-btn-sm" onClick={() => openReject(row)}>
                            Reject
                          </button>
                          <button
                            type="button"
                            class="hr-btn hr-btn-sm"
                            title="Open kind-specific decision"
                            onClick={() => {
                              setActive(row);
                              setDecision("approve");
                              setNote("");
                              setAmount("");
                              setTerms("");
                              setCertType("COE");
                              setEffectiveDate("");
                              setMode("kind");
                            }}
                          >
                            {kindLabel(row.kind)}…
                          </button>
                        </div>
                      </Show>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </HrTcard>

      <p class="hr-muted mt-2">
        Approved loans and advances become payroll deductions <HrPlanned />. Pay questions can be linked to a workplace problem{" "}
        <HrPlanned />. Live close sets status to Closed (Approve).
      </p>

      <Show when={mode() === "approve" && active()}>
        {(row) => (
          <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="Approve request?">
            <div class="w-full max-w-md rounded-lg border border-stroke bg-surface p-4 shadow-lg">
              <div class="mb-3 flex items-center justify-between gap-2">
                <h2 class="text-sm font-semibold">Approve request?</h2>
                <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setMode(null)}>
                  ✕
                </button>
              </div>
              <p class="mb-2 text-sm">
                <b>{row().employee_name}</b> · {kindLabel(row().kind)}
              </p>
              <p class="mb-3 text-sm text-text-secondary">
                Approving a loan or salary advance creates a payroll deduction schedule <HrPlanned />. This closes the request with the live API.
              </p>
              <Field label="Note (optional)">
                <textarea class={inputClass} rows={3} value={note()} onInput={(e) => setNote(e.currentTarget.value)} />
              </Field>
              <div class="mt-4 flex flex-wrap justify-end gap-2">
                <button type="button" class="hr-btn" onClick={() => setMode(null)}>
                  Cancel
                </button>
                <button type="button" class="hr-btn hr-btn-primary" disabled={busy()} onClick={() => void confirmApprove()}>
                  Approve
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>

      <Show when={mode() === "reject" && active()}>
        {(row) => (
          <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="Reject request?">
            <div class="w-full max-w-md rounded-lg border border-stroke bg-surface p-4 shadow-lg">
              <div class="mb-3 flex items-center justify-between gap-2">
                <h2 class="text-sm font-semibold">Reject request?</h2>
                <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setMode(null)}>
                  ✕
                </button>
              </div>
              <p class="mb-2 text-sm">
                <b>{row().employee_name}</b> · {kindLabel(row().kind)}
              </p>
              <p class="mb-3 text-sm text-text-secondary">
                Rejected status <HrPlanned /> — the API only closes pending requests today.
              </p>
              <label class="block text-sm">
                <span class="mb-1 block font-medium">
                  Reason <span class="text-red-700">*</span>
                </span>
                <textarea class={inputClass} rows={3} value={note()} onInput={(e) => setNote(e.currentTarget.value)} />
              </label>
              <div class="mt-4 flex flex-wrap justify-end gap-2">
                <button type="button" class="hr-btn" onClick={() => setMode(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  class="hr-btn hr-btn-sm rounded-lg border border-red-300 bg-red-600 px-3 text-white"
                  disabled={busy()}
                  onClick={() => void confirmReject()}
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>

      <Show when={mode() === "kind" && active()}>
        {(row) => (
          <div
            class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
            role="dialog"
            aria-modal="true"
            aria-label={`${kindLabel(row().kind)} request · ${row().employee_name}`}
          >
            <div class="max-h-[90vh] w-full max-w-lg overflow-auto rounded-lg border border-stroke bg-surface p-4 shadow-lg">
              <div class="mb-3 flex items-center justify-between gap-2">
                <h2 class="text-sm font-semibold">
                  {kindLabel(row().kind)} request · {row().employee_name}
                </h2>
                <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setMode(null)}>
                  ✕
                </button>
              </div>
              <p class="mb-3 text-sm text-text-secondary">{row().details || "No details."}</p>

              <div class="grid gap-3 sm:grid-cols-2">
                <Show when={row().kind === "loan"}>
                  <Field label="Approved amount (₱)">
                    <input type="number" class={inputClass} value={amount()} onInput={(e) => setAmount(e.currentTarget.value)} />
                  </Field>
                  <Field label="Terms (pay periods)">
                    <input type="number" class={inputClass} value={terms()} onInput={(e) => setTerms(e.currentTarget.value)} />
                  </Field>
                  <p class="hr-muted sm:col-span-2">
                    Amount / terms saved to payroll schedule <HrPlanned />
                  </p>
                </Show>

                <Show when={row().kind === "salary_advance"}>
                  <Field label="Amount (₱)">
                    <input type="number" class={inputClass} value={amount()} onInput={(e) => setAmount(e.currentTarget.value)} />
                  </Field>
                  <Field label="Deduct on">
                    <select class={inputClass}>
                      <option>Next payroll</option>
                    </select>
                  </Field>
                  <p class="hr-muted sm:col-span-2">
                    Deduction schedule <HrPlanned />
                  </p>
                </Show>

                <Show when={row().kind === "certificate"}>
                  <Field label="Certificate">
                    <select class={inputClass} value={certType()} onChange={(e) => setCertType(e.currentTarget.value)}>
                      <option value="COE">COE</option>
                      <option value="Compensation">Compensation</option>
                    </select>
                  </Field>
                  <p class="hr-muted sm:col-span-2">
                    Certificate generation <HrPlanned />
                  </p>
                </Show>

                <Show when={row().kind === "resignation"}>
                  <Field label="Effective date">
                    <input type="date" class={inputClass} value={effectiveDate()} onInput={(e) => setEffectiveDate(e.currentTarget.value)} />
                  </Field>
                  <p class="hr-muted sm:col-span-2">
                    Approval starts Offboarding &amp; clearance <HrPlanned />
                  </p>
                </Show>

                <Field label="Decision">
                  <select
                    class={inputClass}
                    value={decision()}
                    onChange={(e) => setDecision(e.currentTarget.value as "approve" | "reject")}
                  >
                    <option value="approve">Approve</option>
                    <option value="reject">Reject</option>
                  </select>
                </Field>
                <div class="sm:col-span-2">
                  <label class="block text-sm">
                    <span class="mb-1 block font-medium">
                      Remarks <span class="text-red-700">*</span>
                    </span>
                    <textarea class={inputClass} rows={3} value={note()} onInput={(e) => setNote(e.currentTarget.value)} />
                  </label>
                </div>
              </div>

              <div class="mt-4 flex flex-wrap justify-end gap-2">
                <button type="button" class="hr-btn" onClick={() => setMode(null)}>
                  Cancel
                </button>
                <button type="button" class="hr-btn hr-btn-primary" disabled={busy()} onClick={() => void saveKindDecision()}>
                  Save decision
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>
    </HrLayout>
  );
}
