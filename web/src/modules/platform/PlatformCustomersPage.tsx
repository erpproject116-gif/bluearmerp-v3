import { A } from "@solidjs/router";
import { formatPeso } from "../../shared/money";
import { useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { useToast } from "../../shared/toast";
import { usePlatformCustomers, usePlatformPlansAdmin, usePlatformBillingSummary, type PlatformPlan } from "../../shared/usePlatform";

const urgencyBadge: Record<string, string> = {
  trial_critical: "bg-red-100 text-red-800",
  trial_urgent: "bg-amber-100 text-amber-800",
  payment_overdue: "bg-red-100 text-red-800",
  new_lead: "bg-slate-100 text-slate-700",
};

type ProvisionForm = {
  email: string;
  full_name: string;
  company_name: string;
  mobile: string;
  plan_kind: string;
  plan_id: number;
};

const emptyForm = (): ProvisionForm => ({
  email: "",
  full_name: "",
  company_name: "",
  mobile: "",
  plan_kind: "trial_90d",
  plan_id: 0,
});

function planOptionLabel(p: PlatformPlan) {
  if (p.plan_code === "trial_90d") return "90-day trial (free)";
  return p.display_name;
}

export default function PlatformCustomersPage() {
  const [search, setSearch] = createSignal("");
  const [showModal, setShowModal] = createSignal(false);
  const [form, setForm] = createSignal<ProvisionForm>(emptyForm());
  const [busy, setBusy] = createSignal(false);
  const q = usePlatformCustomers(search);
  const summaryQ = usePlatformBillingSummary();
  const plansQ = usePlatformPlansAdmin();
  const queryClient = useQueryClient();
  const toast = useToast();

  const planOptions = () => {
    const plans = plansQ.data ?? [];
    const trial = plans.find((p) => p.plan_code === "trial_90d");
    const paid = plans.filter(
      (p) => p.is_active && !p.plan_code.includes("demo") && p.plan_code !== "trial_90d",
    );
    return trial ? [trial, ...paid] : paid;
  };

  const setField = <K extends keyof ProvisionForm>(key: K, value: ProvisionForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const onPlanChange = (value: string) => {
    const id = Number(value);
    if (Number.isNaN(id) || id <= 0) {
      setForm((f) => ({ ...f, plan_kind: "trial_90d", plan_id: 0 }));
      return;
    }
    const plan = (plansQ.data ?? []).find((p) => p.id === id);
    setForm((f) => ({
      ...f,
      plan_kind: plan?.plan_code ?? "trial_90d",
      plan_id: id,
    }));
  };

  const selectedPlanValue = () => {
    const f = form();
    return f.plan_id > 0 ? String(f.plan_id) : "trial_90d";
  };

  const submitProvision = async () => {
    if (busy()) return;
    const f = form();
    if (!f.email.trim() || !f.full_name.trim()) {
      toast.warning("Email and full name are required.");
      return;
    }
    setBusy(true);
    const body: Record<string, unknown> = {
      email: f.email.trim(),
      full_name: f.full_name.trim(),
      company_name: f.company_name.trim(),
      mobile: f.mobile.trim(),
    };
    if (f.plan_id > 0) {
      body.plan_id = f.plan_id;
      body.plan_kind = f.plan_kind;
    } else {
      body.plan_kind = "trial_90d";
    }

    const res = await apiFetch<{
      customer_id?: number;
      company_code?: string;
      invited?: boolean;
      already_provisioned?: boolean;
    }>("/api/v1/platform/console/customers/provision", {
      method: "POST",
      body: JSON.stringify(body),
    });
    setBusy(false);

    if (!res.ok) {
      toast.error(res.message ?? "Failed to provision workspace.");
      return;
    }

    const data = res.data;
    if (data?.already_provisioned) {
      toast.success(`Workspace already exists (${data.company_code ?? "see customer record"}).`);
    } else if (data?.invited) {
      toast.success(
        `Workspace ${data.company_code ?? ""} created. User must sign in with Google using ${f.email.trim()}.`,
      );
    } else {
      toast.success(`Workspace ${data?.company_code ?? ""} provisioned and linked.`);
    }

    setShowModal(false);
    setForm(emptyForm());
    void queryClient.invalidateQueries({ queryKey: ["platform-customers"] });
    await q.refetch();
  };

  return (
    <div class="mx-auto max-w-6xl p-6">
      <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 class="text-xl font-semibold text-text-primary">Platform customers</h1>
          <p class="text-sm text-text-secondary">Subscription registry and CRM traceability</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            onClick={() => setShowModal(true)}
          >
            Add customer &amp; provision
          </button>
          <input
            type="search"
            placeholder="Search email or company…"
            class="rounded-lg border border-stroke px-3 py-2 text-sm"
            value={search()}
            onInput={(e) => setSearch(e.currentTarget.value)}
          />
        </div>
      </div>

      <Show when={summaryQ.data}>
        {(s) => (
          <div class="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div class="rounded-xl border border-stroke bg-white p-4">
              <p class="text-xs uppercase text-text-secondary">MRR</p>
              <p class="mt-1 text-2xl font-semibold text-text-primary">{formatPeso(s().mrr)}</p>
              <p class="text-xs text-text-secondary">Active paid subscriptions</p>
            </div>
            <div class="rounded-xl border border-stroke bg-white p-4">
              <p class="text-xs uppercase text-text-secondary">Expiring ≤ 7 days</p>
              <p class="mt-1 text-2xl font-semibold text-amber-700">{s().expiring_7_days}</p>
            </div>
            <div class="rounded-xl border border-stroke bg-white p-4">
              <p class="text-xs uppercase text-text-secondary">Expiring ≤ 30 days</p>
              <p class="mt-1 text-2xl font-semibold text-text-primary">{s().expiring_30_days}</p>
            </div>
            <div class="rounded-xl border border-stroke bg-white p-4">
              <p class="text-xs uppercase text-text-secondary">Overdue invoices</p>
              <p class="mt-1 text-2xl font-semibold text-red-700">{s().overdue_invoices}</p>
              <p class="text-xs text-text-secondary">{formatPeso(s().overdue_amount)} outstanding</p>
            </div>
          </div>
        )}
      </Show>

      <Show when={showModal()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div class="w-full max-w-md rounded-xl border border-stroke bg-white p-6 shadow-lg">
            <h2 class="text-lg font-semibold text-text-primary">Provision workspace</h2>
            <p class="mt-1 text-sm text-text-secondary">
              Creates a customer record, ERP workspace, and subscription. The owner signs in with Google using the email below.
            </p>
            <div class="mt-4 space-y-3">
              <label class="block text-sm">
                <span class="text-text-secondary">Email *</span>
                <input
                  type="email"
                  class="mt-1 w-full rounded-lg border border-stroke px-3 py-2 text-sm"
                  value={form().email}
                  onInput={(e) => setField("email", e.currentTarget.value)}
                />
              </label>
              <label class="block text-sm">
                <span class="text-text-secondary">Full name *</span>
                <input
                  type="text"
                  class="mt-1 w-full rounded-lg border border-stroke px-3 py-2 text-sm"
                  value={form().full_name}
                  onInput={(e) => setField("full_name", e.currentTarget.value)}
                />
              </label>
              <label class="block text-sm">
                <span class="text-text-secondary">Company name</span>
                <input
                  type="text"
                  class="mt-1 w-full rounded-lg border border-stroke px-3 py-2 text-sm"
                  placeholder="Defaults to “{name}'s Workspace”"
                  value={form().company_name}
                  onInput={(e) => setField("company_name", e.currentTarget.value)}
                />
              </label>
              <label class="block text-sm">
                <span class="text-text-secondary">Mobile</span>
                <input
                  type="text"
                  class="mt-1 w-full rounded-lg border border-stroke px-3 py-2 text-sm"
                  value={form().mobile}
                  onInput={(e) => setField("mobile", e.currentTarget.value)}
                />
              </label>
              <label class="block text-sm">
                <span class="text-text-secondary">Plan</span>
                <select
                  class="mt-1 w-full rounded-lg border border-stroke px-3 py-2 text-sm"
                  value={selectedPlanValue()}
                  onChange={(e) => onPlanChange(e.currentTarget.value)}
                >
                  <option value="trial_90d">90-day trial (free)</option>
                  <For each={planOptions().filter((p) => p.plan_code !== "trial_90d")}>
                    {(p) => <option value={String(p.id)}>{planOptionLabel(p)}</option>}
                  </For>
                </select>
              </label>
            </div>
            <div class="mt-6 flex justify-end gap-2">
              <button
                type="button"
                class="rounded-lg border border-stroke px-4 py-2 text-sm"
                disabled={busy()}
                onClick={() => {
                  setShowModal(false);
                  setForm(emptyForm());
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                disabled={busy()}
                onClick={() => void submitProvision()}
              >
                {busy() ? "Provisioning…" : "Provision"}
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={q.isPending} fallback={
        <Show when={q.isError} fallback={
          <div class="overflow-hidden rounded-xl border border-stroke bg-white">
            <table class="w-full text-left text-sm">
              <thead class="border-b border-stroke bg-slate-50 text-xs uppercase text-text-secondary">
                <tr>
                  <th class="px-4 py-3">Customer</th>
                  <th class="px-4 py-3">Plan</th>
                  <th class="px-4 py-3">Urgency</th>
                  <th class="px-4 py-3">Days left</th>
                  <th class="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                <For each={q.data ?? []}>
                  {(c) => (
                    <tr class="border-b border-stroke last:border-0">
                      <td class="px-4 py-3">
                        <div class="font-medium">{c.full_name || c.email}</div>
                        <div class="text-xs text-text-secondary">{c.email}</div>
                        <Show when={c.company_code}>
                          <div class="text-xs text-text-secondary">{c.company_code}</div>
                        </Show>
                      </td>
                      <td class="px-4 py-3">{c.plan_kind ?? "—"}</td>
                      <td class="px-4 py-3">
                        <span class={`rounded-full px-2 py-0.5 text-xs ${urgencyBadge[c.urgency_label] ?? "bg-slate-100"}`}>
                          {c.urgency_label.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td class="px-4 py-3">{c.days_remaining ?? "—"}</td>
                      <td class="px-4 py-3 text-right">
                        <A href={`/app/platform/customers/${c.id}`} class="text-brand-600 hover:underline">
                          View
                        </A>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        }>
          <p class="text-sm text-red-600">Failed to load customers.</p>
        </Show>
      }>
        <p class="text-sm text-text-secondary">Loading…</p>
      </Show>
    </div>
  );
}
