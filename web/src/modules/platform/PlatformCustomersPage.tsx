import { A, useSearchParams } from "@solidjs/router";
import { formatPeso } from "../../shared/money";
import { useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { useToast } from "../../shared/toast";
import {
  usePlatformCommandOverview,
  usePlatformWorkspaces,
  usePlatformPlansAdmin,
  usePlatformBillingSummary,
  type PlatformCustomer,
  type PlatformPlan,
  type PlatformWorkspace,
  type PlatformWorkspacePerson,
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

function isProtectedEmail(email: string) {
  return PLATFORM_CONSOLE_EMAILS.has((email || "").trim().toLowerCase());
}

function WorkspaceFlags(props: { w: PlatformWorkspace }) {
  const f = () => props.w.flags ?? {};
  return (
    <div class="flex flex-wrap gap-1">
      <Show when={f().owner_is_support_ghost}>
        <span class="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-900">
          Owner is support ghost
        </span>
      </Show>
      <Show when={!f().owner_is_support_ghost && f().owner_disabled}>
        <span class="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-900">
          Owner disabled
        </span>
      </Show>
      <Show when={f().billing_is_not_owner}>
        <span class="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
          Billing ≠ owner
        </span>
      </Show>
      <Show when={f().likely_misjoin}>
        <span class="inline-block rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-900">
          Likely mis-join
        </span>
      </Show>
      <Show when={f().no_active_sub}>
        <span class="inline-block rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
          No active sub
        </span>
      </Show>
    </div>
  );
}

function personKindBadge(kind?: string | null) {
  if (kind === "owner") {
    return (
      <span class="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900">
        Owner
      </span>
    );
  }
  return (
    <span class="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
      Member
    </span>
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
  const [expanded, setExpanded] = createSignal<Set<number>>(new Set());
  const q = usePlatformWorkspaces({ q: () => search(), tenantStatus: () => tenantStatus() });
  const summaryQ = usePlatformBillingSummary();
  const commandQ = usePlatformCommandOverview();
  const plansQ = usePlatformPlansAdmin();
  const queryClient = useQueryClient();
  const toast = useToast();
  const pendingApprovals = () => commandQ.data?.counts?.pending_approvals ?? 0;

  const toggleExpanded = (tenantId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(tenantId)) next.delete(tenantId);
      else next.add(tenantId);
      return next;
    });
  };

  const workspaceViewId = (w: PlatformWorkspace): number | null => {
    if (w.billing_customer?.customer_id) return w.billing_customer.customer_id;
    for (const p of w.people ?? []) {
      if (p.customer_id) return p.customer_id;
    }
    return null;
  };

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
    void queryClient.invalidateQueries({ queryKey: ["platform-workspaces"] });
    void queryClient.invalidateQueries({ queryKey: ["platform-customers"] });
    await q.refetch();
  };

  const removePerson = (w: PlatformWorkspace, p: PlatformWorkspacePerson) => {
    if (!p.customer_id) return;
    if (isProtectedEmail(p.email)) {
      toast.warning("Product owner / superadmin contacts and BLUEARM cannot be removed from this list.");
      return;
    }
    void removeCustomer({
      id: p.customer_id,
      email: p.email,
      full_name: p.full_name ?? p.email,
      entry_source: "",
      urgency_label: "",
      tenant_id: w.tenant_id,
      company_code: w.company_code,
    } as PlatformCustomer);
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
    void queryClient.invalidateQueries({ queryKey: ["platform-workspaces"] });
    void queryClient.invalidateQueries({ queryKey: ["platform-customers"] });
    await q.refetch();
  };

  return (
    <div class="space-y-4">
      <div class="mb-2 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 class="text-xl font-semibold text-text-primary">Customers</h1>
          <p class="text-sm text-text-secondary">Companies, billing, and people</p>
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
            placeholder="Search email, company, or code…"
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
            <table class="w-full min-w-[52rem] text-left text-sm">
              <thead class="border-b border-stroke bg-slate-50 text-xs uppercase text-text-secondary">
                <tr>
                  <th class="px-4 py-3">Company</th>
                  <th class="px-4 py-3">Status</th>
                  <th class="hidden px-4 py-3 md:table-cell">Plan</th>
                  <th class="hidden px-4 py-3 md:table-cell">Owner</th>
                  <th class="hidden px-4 py-3 lg:table-cell">Billing contact</th>
                  <th class="px-4 py-3">Health</th>
                  <th class="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                <For each={q.data?.workspaces ?? []}>
                  {(w) => (
                    <>
                    <tr class="border-b border-stroke last:border-0">
                      <td class="px-4 py-3">
                        <button
                          type="button"
                          class="text-left font-medium text-text-primary hover:underline"
                          onClick={() => toggleExpanded(w.tenant_id)}
                        >
                          {w.company_name || w.company_code || `Workspace ${w.tenant_id}`}
                        </button>
                        <div class="text-xs text-text-secondary">{w.company_code}</div>
                        <button
                          type="button"
                          class="mt-1 text-xs text-brand-600 hover:underline"
                          onClick={() => toggleExpanded(w.tenant_id)}
                        >
                          {expanded().has(w.tenant_id) ? "Hide people" : `People (${w.people_count ?? 0})`}
                        </button>
                      </td>
                      <td class="px-4 py-3">
                        <Show
                          when={w.tenant_status === "pending_approval"}
                          fallback={
                            <Show
                              when={w.tenant_status === "suspended"}
                              fallback={
                                <span class="capitalize text-text-secondary">{(w.tenant_status || "—").replace(/_/g, " ")}</span>
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
                      <td class="hidden px-4 py-3 md:table-cell">
                        <div>{w.plan_kind ?? "—"}</div>
                        <div class="text-xs text-text-secondary">
                          {(w.subscription_status ?? "—")}{w.days_remaining != null ? ` · ${w.days_remaining}d left` : ""}
                        </div>
                      </td>
                      <td class="hidden px-4 py-3 md:table-cell">
                        <div class="font-medium">{w.owner?.full_name || w.owner?.email || "—"}</div>
                        <div class="text-xs text-text-secondary">{w.owner?.email}</div>
                      </td>
                      <td class="hidden px-4 py-3 lg:table-cell">
                        <Show when={w.billing_customer} fallback={<span class="text-text-secondary">—</span>}>
                          <div class="font-medium">{w.billing_customer?.full_name || w.billing_customer?.email}</div>
                          <div class="text-xs text-text-secondary">{w.billing_customer?.email}</div>
                        </Show>
                      </td>
                      <td class="px-4 py-3">
                        <WorkspaceFlags w={w} />
                      </td>
                      <td class="px-4 py-3 text-right">
                        <div class="flex flex-col items-end gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-3">
                          <Show when={workspaceViewId(w) != null}>
                            <A href={`/app/platform-command/customers/${workspaceViewId(w)}`} class="text-brand-600 hover:underline">
                              View
                            </A>
                          </Show>
                        </div>
                      </td>
                    </tr>
                    <Show when={expanded().has(w.tenant_id)}>
                      <tr class="border-b border-stroke bg-slate-50/60">
                        <td class="px-4 py-2" colSpan={7}>
                          <p class="px-1 py-1 text-xs font-medium uppercase text-text-secondary">
                            People in {w.company_name || w.company_code}
                          </p>
                          <table class="w-full text-left text-sm">
                            <thead class="text-xs uppercase text-text-secondary">
                              <tr>
                                <th class="px-3 py-2">Name</th>
                                <th class="px-3 py-2">Email</th>
                                <th class="px-3 py-2">Role</th>
                                <th class="hidden px-3 py-2 md:table-cell">Plan</th>
                                <th class="px-3 py-2" />
                              </tr>
                            </thead>
                            <tbody>
                              <For each={w.people ?? []}>
                                {(p) => (
                                  <tr class="border-t border-stroke">
                                    <td class="px-3 py-2">
                                      {p.full_name || "—"}
                                      <Show when={p.is_support_ghost}>
                                        <span class="ml-2 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-900">
                                          Support
                                        </span>
                                      </Show>
                                      <Show when={p.likely_misjoin}>
                                        <span class="ml-2 inline-block rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-900">
                                          Likely mis-join
                                        </span>
                                      </Show>
                                    </td>
                                    <td class="px-3 py-2 text-text-secondary">{p.email}</td>
                                    <td class="px-3 py-2">{personKindBadge(p.kind)}</td>
                                    <td class="hidden px-3 py-2 md:table-cell">{p.plan_kind ?? "—"}</td>
                                    <td class="px-3 py-2 text-right">
                                      <div class="flex items-center justify-end gap-3">
                                        <Show when={p.customer_id}>
                                          <A href={`/app/platform-command/customers/${p.customer_id}`} class="text-brand-600 hover:underline">
                                            View
                                          </A>
                                          <Show when={!isProtectedEmail(p.email)}>
                                            <button
                                              type="button"
                                              class="text-red-700 hover:underline disabled:opacity-50"
                                              disabled={removingId() === p.customer_id}
                                              onClick={() => removePerson(w, p)}
                                            >
                                              {removingId() === p.customer_id ? "Removing…" : "Remove"}
                                            </button>
                                          </Show>
                                        </Show>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </For>
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    </Show>
                    </>
                  )}
                </For>
              </tbody>
            </table>
          </div>
          <Show when={(q.data?.unlinked ?? []).length > 0}>
            <section class="mt-8">
              <h2 class="text-lg font-semibold text-text-primary">Leads without a workspace</h2>
              <p class="mt-1 text-sm text-text-secondary">Contacts not linked to any company yet. Provision from here or the header button.</p>
              <div class="mt-4 overflow-x-auto rounded-xl border border-stroke bg-white">
                <table class="w-full text-left text-sm">
                  <thead class="text-xs uppercase text-text-secondary">
                    <tr>
                      <th class="px-4 py-2">Name</th>
                      <th class="px-4 py-2">Email</th>
                      <th class="hidden px-4 py-2 md:table-cell">Urgency</th>
                      <th class="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    <For each={q.data?.unlinked ?? []}>
                      {(p) => (
                        <tr class="border-t border-stroke">
                          <td class="px-4 py-2">{p.full_name || "—"}</td>
                          <td class="px-4 py-2 text-text-secondary">{p.email}</td>
                          <td class="hidden px-4 py-2 md:table-cell">
                            <Show when={p.urgency_label} fallback={<span class="text-text-secondary">—</span>}>
                              <span class={`rounded-full px-2 py-0.5 text-xs ${urgencyBadge[p.urgency_label ?? ""] ?? "bg-slate-100"}`}>
                                {(p.urgency_label ?? "").replace(/_/g, " ")}
                              </span>
                            </Show>
                          </td>
                          <td class="px-4 py-2 text-right">
                            <div class="flex items-center justify-end gap-3">
                              <Show when={p.customer_id}>
                                <A href={`/app/platform-command/customers/${p.customer_id}`} class="text-brand-600 hover:underline">
                                  View
                                </A>
                                <Show when={!isProtectedEmail(p.email)}>
                                  <button
                                    type="button"
                                    class="text-red-700 hover:underline disabled:opacity-50"
                                    disabled={removingId() === p.customer_id}
                                    onClick={() => {
                                      if (!p.customer_id) return;
                                      void removeCustomer({
                                        id: p.customer_id,
                                        email: p.email,
                                        full_name: p.full_name ?? p.email,
                                        entry_source: "",
                                        urgency_label: "",
                                        tenant_id: null,
                                        company_code: null,
                                      } as PlatformCustomer);
                                    }}
                                  >
                                    {removingId() === p.customer_id ? "Removing…" : "Remove"}
                                  </button>
                                </Show>
                              </Show>
                            </div>
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
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
