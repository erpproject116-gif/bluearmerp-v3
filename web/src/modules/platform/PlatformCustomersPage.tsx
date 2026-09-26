import { A, useSearchParams } from "@solidjs/router";
import { formatPeso } from "../../shared/money";
import { useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { useToast } from "../../shared/toast";
import {
  usePlatformCommandOverview,
  usePlatformCustomers,
  usePlatformPlansAdmin,
  usePlatformBillingSummary,
  type PlatformCustomer,
  type PlatformPlan,
} from "../../shared/usePlatform";
import { LoadingText } from "../../shared/LoadingText";
import { PLATFORM_CONSOLE_EMAILS } from "../../shared/auth-context";

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
  if (p.plan_code === "trial_90d") return p.trial_days ? `${p.trial_days}-day trial (free)` : "14-day trial (free)";
  return p.display_name;
}

function isProtectedContact(c: PlatformCustomer) {
  return Boolean(
    c.is_product_owner ||
      c.is_platform_superadmin ||
      c.is_operator_workspace ||
      PLATFORM_CONSOLE_EMAILS.has((c.email || "").trim().toLowerCase()),
  );
}

function CustomerAccessBadges(props: { c: PlatformCustomer }) {
  return (
    <div class="mt-1 flex flex-wrap gap-1">
      <Show when={props.c.is_product_owner || props.c.is_platform_superadmin || props.c.access_label}>
        <span class="inline-block rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-900">
          {props.c.access_label || "Product owner / superadmin"}
        </span>
      </Show>
      <Show when={props.c.is_operator_workspace || props.c.workspace_label}>
        <span class="inline-block rounded-full bg-slate-800 px-2 py-0.5 text-xs font-medium text-white">
          {props.c.workspace_label || "Operator (BLUEARM)"}
        </span>
      </Show>
      <Show when={props.c.likely_misjoin}>
        <span class="inline-block rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-900">
          Likely mis-join
        </span>
      </Show>
    </div>
  );
}

export default function PlatformCustomersPage() {
  const [searchParams] = useSearchParams();
  const initialStatus = () => {
    const v = searchParams.tenant_status;
    return typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? "") : "";
  };
  const [search, setSearch] = createSignal("");
  const [tenantStatus, setTenantStatus] = createSignal(initialStatus());
  const [showModal, setShowModal] = createSignal(false);
  const [form, setForm] = createSignal<ProvisionForm>(emptyForm());
  const [busy, setBusy] = createSignal(false);
  const [removingId, setRemovingId] = createSignal<number | null>(null);
  const q = usePlatformCustomers({ q: () => search(), tenantStatus: () => tenantStatus() });
  const owners = () => (q.data ?? []).filter((c) => c.is_workspace_owner || !c.tenant_id);
  const memberGroups = () => {
    const groups = new Map<number, { workspace: string; people: PlatformCustomer[] }>();
    for (const c of q.data ?? []) {
      if (!c.tenant_id || c.is_workspace_owner) continue;
      const current = groups.get(c.tenant_id) ?? {
        workspace: c.company_code || c.company_name || `Workspace ${c.tenant_id}`,
        people: [],
      };
      current.people.push(c);
      groups.set(c.tenant_id, current);
    }
    return [...groups.values()];
  };
  const summaryQ = usePlatformBillingSummary();
  const commandQ = usePlatformCommandOverview();
  const plansQ = usePlatformPlansAdmin();
  const queryClient = useQueryClient();
  const toast = useToast();
  const pendingApprovals = () => commandQ.data?.counts?.pending_approvals ?? 0;

  const removeCustomer = async (c: PlatformCustomer) => {
    if (isProtectedContact(c)) {
      toast.warning("Product owner / superadmin contacts and BLUEARM cannot be removed from this list.");
      return;
    }
    const email = c.email;
    const hasWorkspace = Boolean(c.tenant_id);
    const code = c.company_code || "";
    const typedEmail = window.prompt(
      hasWorkspace
        ? `Remove ${email}?\nThis will WIPE company ${code || "(workspace)"}, free the email for re-use, and delete the contact.\nType the email to confirm:`
        : `Remove contact ${email} from Platform Command?\nAlso frees any workspace memberships so the email can be provisioned again.\nType the email to confirm:`,
      "",
    );
    if (typedEmail == null) return;
    if (typedEmail.trim().toLowerCase() !== email.trim().toLowerCase()) {
      toast.warning("Email did not match — nothing was removed.");
      return;
    }
    let companyCodeConfirm = "";
    if (hasWorkspace) {
      const typedCode = window.prompt(`Type company code ${code} to wipe the workspace:`, "");
      if (typedCode == null) return;
      if (typedCode.trim() !== code) {
        toast.warning("Company code did not match — nothing was removed.");
        return;
      }
      companyCodeConfirm = typedCode.trim();
      if (
        !confirm(
          `Permanently wipe ${code} and remove ${email} from Platform Command? This cannot be undone.`,
        )
      ) {
        return;
      }
    } else if (!confirm(`Remove contact ${email}? This cannot be undone.`)) {
      return;
    }

    setRemovingId(c.id);
    const res = await apiFetch(
      `/api/v1/platform/console/customers/${c.id}`,
      {
        method: "DELETE",
        body: JSON.stringify({
          confirm_email: email,
          acknowledge_irreversible: true,
          wipe_if_linked: hasWorkspace,
          confirm_company_code: companyCodeConfirm || undefined,
        }),
      },
      { silent: true },
    );
    setRemovingId(null);
    if (!res.ok) {
      toast.error(res.message ?? "Could not remove that customer.");
      return;
    }
    toast.success(res.message ?? "Customer removed.");
    void queryClient.invalidateQueries({ queryKey: ["platform-customers"] });
    await q.refetch();
  };

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

  const submitProvision = async (forceRelease = false) => {
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
    if (forceRelease) body.force_release_memberships = true;
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
      const msg = res.message ?? "Failed to provision workspace.";
      if (!forceRelease && /already belongs to another business/i.test(msg)) {
        if (
          confirm(
            `${msg}\n\nFree this email's existing memberships (e.g. Bluearm Philippines) and provision anyway?`,
          )
        ) {
          await submitProvision(true);
          return;
        }
      }
      toast.error(msg);
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
    <div class="space-y-4">
      <div class="mb-2 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 class="text-xl font-semibold text-text-primary">Customers</h1>
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
          <select
            class="rounded-lg border border-stroke px-3 py-2 text-sm"
            value={tenantStatus()}
            onChange={(e) => setTenantStatus(e.currentTarget.value)}
          >
            <option value="">All workspaces</option>
            <option value="pending_approval">Pending approval</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="cancelled">Cancelled</option>
          </select>
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
          <div class="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <button
              type="button"
              class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-left hover:bg-amber-100"
              onClick={() => setTenantStatus("pending_approval")}
            >
              <p class="text-xs uppercase text-amber-900">Pending approvals</p>
              <p class="mt-1 text-2xl font-semibold text-amber-950">{pendingApprovals()}</p>
              <p class="text-xs text-amber-900">Exception workspaces (pending_approval)</p>
            </button>
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
        <div class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
          <div class="my-4 w-full max-w-md rounded-xl border border-stroke bg-white p-6 shadow-lg sm:my-0">
            <h2 class="text-lg font-semibold text-text-primary">Provision workspace (exceptions)</h2>
            <p class="mt-1 text-sm text-text-secondary">
              For manual onboarding, re-provision after wipe, or sales-assisted signup — not the default self-serve trial
              (users create workspaces from Welcome → Start free trial). Creates customer, workspace, and subscription;
              owner signs in with Google using the email below.
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
                  <option value="trial_90d">14-day trial (free)</option>
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
          <>
          <div class="overflow-x-auto rounded-xl border border-stroke bg-white">
            <table class="w-full min-w-[40rem] text-left text-sm">
              <thead class="border-b border-stroke bg-slate-50 text-xs uppercase text-text-secondary">
                <tr>
                  <th class="px-4 py-3">Customer</th>
                  <th class="px-4 py-3">Workspace</th>
                  <th class="hidden px-4 py-3 md:table-cell">Plan</th>
                  <th class="hidden px-4 py-3 md:table-cell">Subscription</th>
                  <th class="hidden px-4 py-3 lg:table-cell">Urgency</th>
                  <th class="hidden px-4 py-3 lg:table-cell">Days left</th>
                  <th class="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                <For each={owners()}>
                  {(c) => (
                    <tr class="border-b border-stroke last:border-0">
                      <td class="px-4 py-3">
                        <div class="font-medium">{c.full_name || c.email}</div>
                        <div class="text-xs text-text-secondary">{c.email}</div>
                        <Show when={c.company_code}>
                          <div class="text-xs text-text-secondary">{c.company_code}</div>
                        </Show>
                        <CustomerAccessBadges c={c} />
                      </td>
                      <td class="px-4 py-3">
                        <Show
                          when={c.tenant_status === "pending_approval"}
                          fallback={
                            <Show
                              when={c.tenant_status === "suspended"}
                              fallback={
                                <span class="capitalize text-text-secondary">{(c.tenant_status || "—").replace(/_/g, " ")}</span>
                              }
                            >
                              <span class="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-800">
                                Suspended
                              </span>
                            </Show>
                          }
                        >
                          <span class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                            Pending approval
                          </span>
                        </Show>
                      </td>
                      <td class="hidden px-4 py-3 md:table-cell">{c.plan_kind ?? "—"}</td>
                      <td class="hidden px-4 py-3 md:table-cell">{c.subscription_status ?? "—"}</td>
                      <td class="hidden px-4 py-3 lg:table-cell">
                        <span class={`rounded-full px-2 py-0.5 text-xs ${urgencyBadge[c.urgency_label] ?? "bg-slate-100"}`}>
                          {c.urgency_label.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td class="hidden px-4 py-3 lg:table-cell">{c.days_remaining ?? "—"}</td>
                      <td class="px-4 py-3 text-right">
                        <div class="flex flex-col items-end gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-3">
                          <A href={`/app/platform-command/customers/${c.id}`} class="text-brand-600 hover:underline">
                            View
                          </A>
                          <Show when={!isProtectedContact(c)}>
                            <button
                              type="button"
                              class="text-red-700 hover:underline disabled:opacity-50"
                              disabled={removingId() === c.id || busy()}
                              onClick={() => void removeCustomer(c)}
                            >
                              {removingId() === c.id ? "Removing…" : "Remove"}
                            </button>
                          </Show>
                        </div>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
          <Show when={memberGroups().length > 0}>
            <section class="mt-8">
              <h2 class="text-lg font-semibold text-text-primary">Team members</h2>
              <p class="mt-1 text-sm text-text-secondary">People invited into a workspace. They are not billed as customers.</p>
              <div class="mt-4 space-y-4">
                <For each={memberGroups()}>
                  {(group) => (
                    <div class="overflow-x-auto rounded-xl border border-stroke bg-white">
                      <p class="border-b border-stroke bg-slate-50 px-4 py-2 text-sm font-medium text-text-primary">{group.workspace}</p>
                      <table class="w-full text-left text-sm">
                        <thead class="text-xs uppercase text-text-secondary">
                          <tr>
                            <th class="px-4 py-2">Name</th>
                            <th class="px-4 py-2">Email</th>
                          </tr>
                        </thead>
                        <tbody>
                          <For each={group.people}>
                            {(person) => (
                              <tr class="border-t border-stroke">
                                <td class="px-4 py-2">{person.full_name || "—"}</td>
                                <td class="px-4 py-2 text-text-secondary">{person.email}</td>
                              </tr>
                            )}
                          </For>
                        </tbody>
                      </table>
                    </div>
                  )}
                </For>
              </div>
            </section>
          </Show>
          </>
        }>
          <p class="text-sm text-red-600">Failed to load customers.</p>
        </Show>
      }>
        <LoadingText class="text-sm text-text-secondary" as="p" />
      </Show>
    </div>
  );
}
