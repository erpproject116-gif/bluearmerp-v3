import { A, useNavigate, useParams } from "@solidjs/router";
import { formatPeso } from "../../shared/money";
import { createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { PLATFORM_CONSOLE_EMAILS, hasPlatformPermission, useAuth } from "../../shared/auth-context";
import { setActiveTenantId } from "../../shared/activeContext";
import {
  usePlatformCustomer,
  usePlatformCustomerEngagement,
  usePlatformCustomerOverview,
  usePlatformCustomerSession,
  usePlatformPlansAdmin,
  usePlatformCustomerSupportSessions,
  type PlatformPlan,
} from "../../shared/usePlatform";
import { LoadingText } from "../../shared/LoadingText";
import { useToast } from "../../shared/toast";

type WipePreflight = {
  can_wipe?: boolean;
  blockers?: string[];
  blockers_are_warnings?: boolean;
  operator_protected?: boolean;
  company_code?: string;
  company_name?: string;
  tenant_id?: number;
  user_count?: number;
  owner_name?: string;
  owner_email?: string;
};

const actionCopy = (path: string): { ok: string; fail: string } => {
  if (path.endsWith("/approve")) {
    return {
      ok: "Signup approved. That company can now use the ERP.",
      fail: "Could not approve this signup.",
    };
  }
  if (path.endsWith("/reject")) {
    return {
      ok: "Signup rejected. No company workspace was created.",
      fail: "Could not reject this signup.",
    };
  }
  if (path.endsWith("/suspend")) {
    return {
      ok: "Company suspended. Users cannot sign in; all data is kept.",
      fail: "Could not suspend this company.",
    };
  }
  if (path.endsWith("/reactivate")) {
    return {
      ok: "Company reactivated. Users can sign in again; data was not changed.",
      fail: "Could not reactivate this company.",
    };
  }
  if (path.endsWith("/subscriptions")) {
    return {
      ok: "Paid plan activated — buy/sell unlocked for this company.",
      fail: "Could not activate that plan.",
    };
  }
  if (path.endsWith("/confirm-day1-payment")) {
    return {
      ok: "Buy/sell unlocked. The QR paywall will clear after they refresh.",
      fail: "Could not unlock buy/sell for this company.",
    };
  }
  if (path.endsWith("/extend-trial")) {
    return {
      ok: "Trial extended by 30 days.",
      fail: "Could not extend the trial.",
    };
  }
  if (path.endsWith("/convert-demo")) {
    return {
      ok: "Demo converted to a trial workspace.",
      fail: "Could not convert this demo.",
    };
  }
  if (path.includes("/invoices/") && path.endsWith("/mark-paid")) {
    return {
      ok: "Invoice marked paid.",
      fail: "Could not mark that invoice paid.",
    };
  }
  if (path.endsWith("/invoices")) {
    return {
      ok: "Invoice created.",
      fail: "Could not create that invoice.",
    };
  }
  return { ok: "Saved.", fail: "That action did not complete." };
};

function planLabel(p: PlatformPlan) {
  const price = p.promo_active ? p.effective_monthly_amount : p.regular_monthly_amount;
  return `${p.display_name} — ${formatPeso(price)}/mo`;
}

function fmtWhen(v?: string | null): string {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

function fmtDuration(sec?: number | null): string {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return r ? `${m}m ${r}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}

export default function PlatformCustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = () => Number(params.id);
  const navigate = useNavigate();
  const toast = useToast();
  const auth = useAuth();
  const q = usePlatformCustomer(id);
  const overview = usePlatformCustomerOverview(id);
  const engagement = usePlatformCustomerEngagement(id);
  const plansQ = usePlatformPlansAdmin();
  const [busy, setBusy] = createSignal(false);
  const [openSessionId, setOpenSessionId] = createSignal<number | null>(null);
  const [wipeOpen, setWipeOpen] = createSignal(false);
  const [wipeCode, setWipeCode] = createSignal("");
  const [wipeAck, setWipeAck] = createSignal(false);
  const [wipeBlockers, setWipeBlockers] = createSignal<string[]>([]);
  const [wipeCan, setWipeCan] = createSignal(true);
  const [wipeWarningsOnly, setWipeWarningsOnly] = createSignal(false);
  const [wipeSnap, setWipeSnap] = createSignal<WipePreflight | null>(null);
  const sessionDetail = usePlatformCustomerSession(id, openSessionId);
  const supportSessions = usePlatformCustomerSupportSessions(id);
  const [openWs, setOpenWs] = createSignal(false);
  const [wsReason, setWsReason] = createSignal("");
  const [wsMode, setWsMode] = createSignal<"read_only" | "read_write">("read_only");

  const canOpenWorkspace = () => hasPlatformPermission(auth.me, "platform.support.access");

  const startSupportWorkspace = async () => {
    const reason = wsReason().trim();
    if (reason.length < 5) {
      toast.error("Reason must be at least 5 characters.");
      return;
    }
    setBusy(true);
    const res = await apiFetch<{
      id: number;
      tenant_id: number;
      customer_id: number;
      ends_at: string;
      access_mode: string;
    }>(
      `/api/v1/platform/console/customers/${id()}/support-sessions`,
      {
        method: "POST",
        body: JSON.stringify({ reason, access_mode: wsMode() }),
      },
      { silent: true },
    );
    setBusy(false);
    if (!res.ok || !res.data) {
      toast.error(res.message ?? "Could not open workspace.");
      return;
    }
    setActiveTenantId(res.data.tenant_id);
    setOpenWs(false);
    setWsReason("");
    setWsMode("read_only");
    await auth.refresh();
    toast.success("Support workspace opened.");
    navigate("/app/dashboard", { replace: true });
  };

  const paidPlans = () =>
    (plansQ.data ?? []).filter((p) => p.is_active && !p.plan_code.includes("trial") && !p.plan_code.includes("demo"));

  const act = async (path: string, body?: object) => {
    const copy = actionCopy(path);
    setBusy(true);
    const res = await apiFetch(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }, { silent: true });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.message ?? copy.fail);
      return res;
    }
    toast.success(res.message ?? copy.ok);
    await q.refetch();
    return res;
  };

  const openWipe = async () => {
    setWipeCode("");
    setWipeAck(false);
    setWipeBlockers([]);
    setWipeCan(true);
    setWipeSnap(null);
    setBusy(true);
    const res = await apiFetch<WipePreflight>(
      `/api/v1/platform/console/customers/${id()}/wipe-preflight`,
      undefined,
      { silent: true },
    );
    setBusy(false);
    if (!res.ok) {
      toast.error(res.message ?? "Could not check whether this company is safe to wipe.");
      return;
    }
    setWipeCan(Boolean(res.data?.can_wipe));
    setWipeBlockers(res.data?.blockers ?? []);
    setWipeWarningsOnly(Boolean(res.data?.blockers_are_warnings));
    setWipeSnap(res.data ?? null);
    setWipeOpen(true);
  };

  const removeContact = async () => {
    const cust = q.data?.customer as Record<string, unknown> | undefined;
    if (!cust) return;
    const email = String(cust.email || "");
    const protectedContact =
      Boolean(cust.is_product_owner) ||
      Boolean(cust.is_platform_superadmin) ||
      Boolean(cust.is_operator_workspace) ||
      PLATFORM_CONSOLE_EMAILS.has(email.trim().toLowerCase());
    if (protectedContact) {
      toast.warning("Product owner / superadmin contacts and BLUEARM cannot be removed.");
      return;
    }
    const hasWorkspace = Boolean(cust.tenant_id);
    const code = String(cust.company_code || "");
    const typedEmail = window.prompt(
      hasWorkspace
        ? `Remove ${email}? This wipes ${code} and deletes the contact. Type the email:`
        : `Remove contact ${email}? Type the email:`,
      "",
    );
    if (typedEmail == null) return;
    if (typedEmail.trim().toLowerCase() !== email.trim().toLowerCase()) {
      toast.warning("Email did not match.");
      return;
    }
    let companyCodeConfirm = "";
    if (hasWorkspace) {
      const typedCode = window.prompt(`Type company code ${code}:`, "");
      if (typedCode == null || typedCode.trim() !== code) {
        toast.warning("Company code did not match.");
        return;
      }
      companyCodeConfirm = typedCode.trim();
    }
    if (!confirm(hasWorkspace ? `Wipe ${code} and remove ${email}?` : `Remove ${email}?`)) return;
    setBusy(true);
    const res = await apiFetch(
      `/api/v1/platform/console/customers/${id()}`,
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
    setBusy(false);
    if (!res.ok) {
      toast.error(res.message ?? "Could not remove this contact.");
      return;
    }
    toast.success(res.message ?? "Contact removed.");
    navigate("/app/platform-command/customers");
  };

  const runWipe = async () => {
    const code = String(
      (q.data?.customer as Record<string, unknown> | undefined)?.company_code ?? wipeSnap()?.company_code ?? "",
    );
    const name = String(
      wipeSnap()?.company_name ||
        (q.data?.customer as Record<string, unknown> | undefined)?.company_name ||
        code,
    );
    const tenantId = Number(
      wipeSnap()?.tenant_id || (q.data?.customer as Record<string, unknown> | undefined)?.tenant_id || 0,
    );
    if (!wipeAck() || wipeCode().trim() !== code) {
      toast.warning(`Type company code ${code} and tick the checkbox. This wipes the whole company, not one person.`);
      return;
    }
    if (!wipeCan()) {
      toast.warning("Wipe is blocked until the listed schema issues are fixed. The company was not deleted.");
      return;
    }
    const signedInHere = Number(auth.me?.tenant?.id || auth.me?.active_tenant_id || 0) === tenantId && tenantId > 0;
    const extra = signedInHere
      ? `\n\nYou are currently signed into this same company (${code}). After wipe, ERP data for this workspace will be gone and you will only have Platform Command.`
      : "";
    if (
      !confirm(
        `Wipe company ${name} (${code})?\n\nThis permanently deletes ALL users (including the owner), inventory, sales, and books.\nIt does NOT only remove the contact on this page.${extra}\n\nThis cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    const res = await apiFetch(
      `/api/v1/platform/console/customers/${id()}/wipe`,
      {
        method: "POST",
        body: JSON.stringify({
          confirm_company_code: wipeCode().trim(),
          acknowledge_irreversible: true,
        }),
      },
      { silent: true },
    );
    setBusy(false);
    if (!res.ok) {
      toast.error(res.message ?? `Could not wipe company ${code}. Nothing was deleted.`);
      return;
    }
    toast.success(res.message ?? `Company ${code} wiped. Contact kept; all workspace data is gone.`);
    setWipeOpen(false);
    await q.refetch();
  };

  return (
    <div class="space-y-6">
      <A href="/app/platform-command/customers" class="text-sm text-slate-500 hover:underline">← Customers</A>
      <Show when={q.isPending} fallback={
        <Show when={q.data} fallback={<p class="text-sm text-red-600">Customer not found.</p>}>
          {(d) => {
            const c = () => d().customer as Record<string, unknown>;
            const ov = () => overview.data;
            const eg = () => engagement.data;
            return (
              <div class="space-y-6">
                <div>
                  <h1 class="text-xl font-semibold">{String(c().full_name || c().email)}</h1>
                  <p class="text-sm text-text-secondary">{String(c().email)}</p>
                  <p class="mt-1 text-xs">
                    Urgency: <strong>{String(c().urgency_label)}</strong> · Source: {String(c().entry_source)}
                    <Show when={c().tenant_status}>
                      {" "}· Workspace: <strong>{String(c().tenant_status).replace(/_/g, " ")}</strong>
                      <Show when={c().company_code}> ({String(c().company_code)})</Show>
                    </Show>
                    {" "}· Trade:{" "}
                    <strong
                      classList={{
                        "text-emerald-700": String(c().commercial_status ?? "") === "unlocked",
                        "text-amber-800": String(c().commercial_status ?? "") !== "unlocked",
                      }}
                    >
                      {String(c().commercial_status || "unlocked").replace(/_/g, " ")}
                    </strong>
                  </p>
                  <Show when={String(c().commercial_status ?? "unlocked") !== "unlocked" && Boolean(c().tenant_id)}>
                    <div class="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                      <p class="font-medium">Buy/sell still locked (QR paywall)</p>
                      <p class="mt-1 text-xs text-amber-900/80">
                        Day 1 list only shows <span class="font-medium">awaiting payment</span> by default. If they paid
                        but Day 1 stock setup is incomplete, confirm here or activate a paid plan below — both unlock
                        trading for manual checkout.
                      </p>
                      <button
                        type="button"
                        class="mt-2 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                        disabled={busy()}
                        onClick={() =>
                          void act(`/api/v1/platform/console/customers/${id()}/confirm-day1-payment`, {
                            note: "Manual payment confirmed by product owner",
                          })
                        }
                      >
                        Unlock buy/sell (payment confirmed)
                      </button>
                    </div>
                  </Show>
                  <div class="mt-2 flex flex-wrap gap-1">
                    <Show when={Boolean(c().is_product_owner) || Boolean(c().is_platform_superadmin) || c().access_label}>
                      <span class="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-900">
                        {String(c().access_label || "Product owner / superadmin")}
                      </span>
                    </Show>
                    <Show when={Boolean(c().is_operator_workspace) || c().workspace_label}>
                      <span class="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-medium text-white">
                        {String(c().workspace_label || "Operator (BLUEARM)")}
                      </span>
                    </Show>
                  </div>
                </div>

                <Show when={Boolean(c().tenant_id) && canOpenWorkspace()}>
                  <div class="space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
                    <div class="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 class="font-semibold">Support cockpit</h2>
                        <p class="mt-1 text-xs text-sky-900/80">
                          Trade: <strong>{String(c().commercial_status || "unlocked").replace(/_/g, " ")}</strong>
                          <Show when={eg()?.summary?.last_activity_at}>
                            {" "}· Last activity {fmtWhen(eg()!.summary.last_activity_at)}
                          </Show>
                        </p>
                      </div>
                      <div class="flex flex-wrap gap-2">
                        <Show when={String(c().tenant_status) === "active"}>
                          <button
                            type="button"
                            class="rounded-lg bg-sky-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-900 disabled:opacity-50"
                            disabled={busy()}
                            onClick={() => setOpenWs(true)}
                          >
                            Open workspace
                          </button>
                        </Show>
                        <Show when={String(c().commercial_status ?? "unlocked") !== "unlocked"}>
                          <button
                            type="button"
                            class="rounded-lg border border-emerald-600 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 disabled:opacity-50"
                            disabled={busy()}
                            onClick={() =>
                              void act(`/api/v1/platform/console/customers/${id()}/confirm-day1-payment`, {
                                note: "Manual payment confirmed by product owner",
                              })
                            }
                          >
                            Unlock buy/sell
                          </button>
                        </Show>
                        <A
                          href="#engagement"
                          class="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-medium text-sky-900"
                        >
                          Analytics
                        </A>
                      </div>
                    </div>
                    <div>
                      <h3 class="text-xs font-semibold uppercase tracking-wide text-sky-900/70">Past support sessions</h3>
                      <Show when={supportSessions.isPending}>
                        <p class="mt-1 text-xs text-sky-800/70">Loading…</p>
                      </Show>
                      <Show when={!supportSessions.isPending && (supportSessions.data?.length ?? 0) === 0}>
                        <p class="mt-1 text-xs text-sky-800/70">No support sessions yet.</p>
                      </Show>
                      <Show when={(supportSessions.data?.length ?? 0) > 0}>
                        <div class="mt-2 overflow-x-auto">
                          <table class="min-w-full text-left text-xs">
                            <thead>
                              <tr class="border-b border-sky-200 text-sky-900/70">
                                <th class="py-1 pr-3 font-medium">When</th>
                                <th class="py-1 pr-3 font-medium">Mode</th>
                                <th class="py-1 pr-3 font-medium">Reason</th>
                                <th class="py-1 font-medium">Ended</th>
                              </tr>
                            </thead>
                            <tbody>
                              <For each={supportSessions.data ?? []}>
                                {(row) => (
                                  <tr class="border-b border-sky-100">
                                    <td class="py-1.5 pr-3 whitespace-nowrap">{fmtWhen(row.started_at)}</td>
                                    <td class="py-1.5 pr-3">{row.access_mode === "read_write" ? "Write" : "Read only"}</td>
                                    <td class="py-1.5 pr-3 max-w-[14rem] truncate" title={row.reason}>{row.reason || "—"}</td>
                                    <td class="py-1.5 whitespace-nowrap">{row.ended_at ? fmtWhen(row.ended_at) : "Open"}</td>
                                  </tr>
                                )}
                              </For>
                            </tbody>
                          </table>
                        </div>
                      </Show>
                    </div>
                  </div>
                </Show>

                <Show when={openWs()}>
                  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div class="w-full max-w-md space-y-4 rounded-xl border border-stroke bg-white p-5 shadow-xl">
                      <h2 class="text-base font-semibold">Open customer workspace</h2>
                      <p class="text-xs text-text-secondary">
                        Creates an audited support session (60 min, optional +30). The company owner gets a soft bell notice.
                      </p>
                      <label class="block text-xs font-medium text-text-secondary">
                        Reason
                        <textarea
                          class="mt-1 w-full rounded-lg border border-stroke px-3 py-2 text-sm"
                          rows={3}
                          value={wsReason()}
                          onInput={(e) => setWsReason(e.currentTarget.value)}
                          placeholder="e.g. Investigating missing GR posting"
                        />
                      </label>
                      <fieldset class="space-y-2 text-sm">
                        <legend class="text-xs font-medium text-text-secondary">Access mode</legend>
                        <label class="flex items-center gap-2">
                          <input
                            type="radio"
                            name="ws-mode"
                            checked={wsMode() === "read_only"}
                            onChange={() => setWsMode("read_only")}
                          />
                          Read only (default)
                        </label>
                        <label class="flex items-center gap-2">
                          <input
                            type="radio"
                            name="ws-mode"
                            checked={wsMode() === "read_write"}
                            onChange={() => setWsMode("read_write")}
                          />
                          Read &amp; write
                        </label>
                      </fieldset>
                      <div class="flex justify-end gap-2">
                        <button
                          type="button"
                          class="rounded-lg border border-stroke px-3 py-1.5 text-sm"
                          onClick={() => setOpenWs(false)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          class="rounded-lg bg-sky-800 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                          disabled={busy()}
                          onClick={() => void startSupportWorkspace()}
                        >
                          Open workspace
                        </button>
                      </div>
                    </div>
                  </div>
                </Show>

                <Show when={Boolean(c().likely_misjoin)}>
                  <div class="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950">
                    Likely mis-join: this email also has an open company invite on another workspace. Prefer rejecting
                    this self-serve signup and having them accept the invite, unless they truly need their own company.
                  </div>
                </Show>

                <Show when={String(c().tenant_status ?? "") === "pending_approval"}>
                  <div class="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p class="flex-1 text-sm text-amber-950">
                      Exception path: workspace status pending_approval (default self-serve trials are active
                      immediately). Approve before this company can sign in.
                    </p>
                    <button
                      type="button"
                      class="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                      disabled={busy()}
                      onClick={() => {
                        if (
                          c().likely_misjoin &&
                          !confirm(
                            "This email also has a pending invite on another company. Approve this separate workspace anyway?",
                          )
                        ) {
                          return;
                        }
                        void act(`/api/v1/platform/console/customers/${id()}/approve`);
                      }}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      class="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 disabled:opacity-50"
                      disabled={busy()}
                      onClick={() => void act(`/api/v1/platform/console/customers/${id()}/reject`, { reason: "Rejected by product owner" })}
                    >
                      Reject
                    </button>
                  </div>
                </Show>

                <Show
                  when={
                    String(c().tenant_status ?? "") === "active" ||
                    String(c().tenant_status ?? "") === "suspended" ||
                    String(c().tenant_status ?? "") === "cancelled" ||
                    String(c().tenant_status ?? "") === "pending_approval"
                  }
                >
                  <div class="space-y-3 rounded-xl border border-stroke bg-white p-4">
                    <h2 class="text-sm font-semibold text-text-primary">Company lifecycle</h2>
                    <p class="text-xs text-text-secondary">
                      This page is the <strong>contact</strong>, not one ERP user. To remove a staff member, use User
                      Management inside that company. <strong>Suspend</strong> locks sign-in and keeps data.{" "}
                      <strong>Close &amp; wipe</strong> deletes the whole company. <strong>Remove contact</strong> wipes
                      (if linked) and deletes this Platform Command row.
                    </p>
                    <div class="flex flex-wrap gap-2">
                      <Show when={String(c().tenant_status) === "active"}>
                        <button
                          type="button"
                          class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-950 disabled:opacity-50"
                          disabled={busy()}
                          onClick={() => {
                            if (
                              !confirm(
                                `Suspend company ${String(c().company_code || c().company_name || "")}? Users cannot sign in. Data is kept. This does not delete the owner.`,
                              )
                            ) {
                              return;
                            }
                            void act(`/api/v1/platform/console/customers/${id()}/suspend`);
                          }}
                        >
                          Suspend access
                        </button>
                      </Show>
                      <Show when={String(c().tenant_status) === "suspended"}>
                        <button
                          type="button"
                          class="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                          disabled={busy()}
                          onClick={() => void act(`/api/v1/platform/console/customers/${id()}/reactivate`)}
                        >
                          Reactivate
                        </button>
                      </Show>
                      <Show when={Boolean(c().tenant_id)}>
                        <button
                          type="button"
                          class="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 disabled:opacity-50"
                          disabled={busy()}
                          onClick={() => void openWipe()}
                        >
                          Close &amp; wipe…
                        </button>
                      </Show>
                      <Show
                        when={
                          !(
                            Boolean(c().is_product_owner) ||
                            Boolean(c().is_platform_superadmin) ||
                            Boolean(c().is_operator_workspace) ||
                            PLATFORM_CONSOLE_EMAILS.has(String(c().email || "").trim().toLowerCase())
                          )
                        }
                      >
                        <button
                          type="button"
                          class="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                          disabled={busy()}
                          onClick={() => void removeContact()}
                        >
                          Remove contact
                        </button>
                      </Show>
                    </div>
                  </div>
                </Show>

                <Show when={!c().tenant_id}>
                  <div class="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
                    <p>
                      No workspace linked. Use <strong>Provision</strong> on the customers list to create a new empty
                      company for this email, or remove the contact below.
                    </p>
                    <Show
                      when={
                        !(
                          Boolean(c().is_product_owner) ||
                          Boolean(c().is_platform_superadmin) ||
                          Boolean(c().is_operator_workspace) ||
                          PLATFORM_CONSOLE_EMAILS.has(String(c().email || "").trim().toLowerCase())
                        )
                      }
                    >
                      <button
                        type="button"
                        class="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                        disabled={busy()}
                        onClick={() => void removeContact()}
                      >
                        Remove contact
                      </button>
                    </Show>
                  </div>
                </Show>

                <Show when={wipeOpen()}>
                  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div class="w-full max-w-lg space-y-3 rounded-xl border border-stroke bg-white p-6 shadow-lg">
                      <h2 class="text-lg font-semibold text-red-800">Close &amp; wipe company</h2>
                      <p class="text-sm text-text-secondary">
                        This deletes company{" "}
                        <strong>
                          {wipeSnap()?.company_name || String(c().company_name || "")} ({String(c().company_code)})
                        </strong>
                        , tenant #{wipeSnap()?.tenant_id ?? String(c().tenant_id ?? "—")},{" "}
                        {wipeSnap()?.user_count ?? "all"} users (including owner{" "}
                        {wipeSnap()?.owner_email || wipeSnap()?.owner_name || "of this workspace"}), inventory, sales,
                        and books. The contact on this page stays so you can provision a new empty company later.
                      </p>
                      <p class="text-sm font-medium text-red-800">
                        Do not use this to remove one person. Ownership handoff is not required for wipe because
                        everyone in this company is deleted.
                      </p>
                      <Show when={wipeBlockers().length > 0}>
                        <div
                          class={`rounded-lg border p-3 text-xs ${
                            wipeWarningsOnly()
                              ? "border-amber-200 bg-amber-50 text-amber-950"
                              : "border-red-200 bg-red-50 text-red-900"
                          }`}
                        >
                          <p class="font-medium">
                            {wipeWarningsOnly()
                              ? "Schema warnings (wipe can still be attempted):"
                              : "Wipe is blocked — the company was not deleted:"}
                          </p>
                          <ul class="mt-1 list-disc pl-4">
                            <For each={wipeBlockers()}>{(b) => <li>{b}</li>}</For>
                          </ul>
                        </div>
                      </Show>
                      <label class="block text-sm">
                        Type company code {String(c().company_code)} to confirm
                        <input
                          class="mt-1 w-full rounded-lg border border-stroke px-3 py-2 text-sm"
                          value={wipeCode()}
                          onInput={(e) => setWipeCode(e.currentTarget.value)}
                          placeholder={String(c().company_code ?? "")}
                          aria-label="Type company code to confirm wipe"
                        />
                      </label>
                      <label class="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          class="mt-1"
                          checked={wipeAck()}
                          onChange={(e) => setWipeAck(e.currentTarget.checked)}
                        />
                        <span>
                          I understand this destroys the whole company, including the owner, and cannot be undone from
                          the app.
                        </span>
                      </label>
                      <div class="flex justify-end gap-2">
                        <button
                          type="button"
                          class="rounded-lg border border-stroke px-3 py-1.5 text-sm"
                          disabled={busy()}
                          onClick={() => setWipeOpen(false)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          class="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                          disabled={busy() || !wipeCan()}
                          onClick={() => void runWipe()}
                        >
                          Wipe permanently
                        </button>
                      </div>
                    </div>
                  </div>
                </Show>

                <Show when={ov()}>
                  <section class="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
                    <div>
                      <p class="text-xs uppercase text-slate-500">Workspace</p>
                      <p class="font-medium">{ov()?.tenant?.company_name || "—"} ({ov()?.tenant?.company_code || "n/a"})</p>
                      <p class="text-xs text-slate-500">{ov()?.tenant?.user_count ?? 0} users · {ov()?.tenant?.open_tickets ?? 0} open tickets</p>
                    </div>
                    <div>
                      <p class="text-xs uppercase text-slate-500">Onboarding</p>
                      <p class="font-medium tabular-nums">{ov()?.onboarding?.overall_percent ?? ov()?.onboarding?.percent ?? 0}%</p>
                      <p class="text-xs text-slate-500">{ov()?.onboarding?.blocking_reason || (ov()?.onboarding?.ready ? "Ready" : "In progress")}</p>
                    </div>
                    <div>
                      <p class="text-xs uppercase text-slate-500">Presence</p>
                      <p class="font-medium text-sm">{ov()?.tenant?.current_screen || "Offline / unknown"}</p>
                      <p class="text-xs text-slate-500">
                        {ov()?.tenant?.last_seen_at ? `Last seen ${new Date(ov()!.tenant.last_seen_at).toLocaleString()}` : "No recent presence"}
                      </p>
                    </div>
                  </section>
                </Show>

                <section class="rounded-xl border border-stroke bg-white p-4">
                  <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 id="engagement" class="text-sm font-semibold">Engagement</h2>
                    <A
                      href={`/app/platform-command/customers/${id()}/analytics`}
                      class="text-xs text-brand-600 hover:underline"
                    >
                      View analytics →
                    </A>
                  </div>
                  <Show when={engagement.isPending}>
                    <LoadingText class="text-sm text-text-secondary" as="p" />
                  </Show>
                  <Show when={eg()}>
                    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <p class="text-xs uppercase text-slate-500">Last login</p>
                        <p class="text-sm font-medium">{fmtWhen(eg()!.summary.last_login_at)}</p>
                      </div>
                      <div>
                        <p class="text-xs uppercase text-slate-500">Last logout</p>
                        <p class="text-sm font-medium">{fmtWhen(eg()!.summary.last_logout_at)}</p>
                        <p class="text-xs text-slate-500">{eg()!.summary.last_end_reason || ""}</p>
                      </div>
                      <div>
                        <p class="text-xs uppercase text-slate-500">Last activity</p>
                        <p class="text-sm font-medium">{fmtWhen(eg()!.summary.last_activity_at)}</p>
                      </div>
                      <div>
                        <p class="text-xs uppercase text-slate-500">Inactivity</p>
                        <p class="text-sm font-medium">
                          {eg()!.summary.inactive_seconds != null ? fmtDuration(eg()!.summary.inactive_seconds) : "—"}
                        </p>
                      </div>
                    </div>

                    <h3 class="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Users</h3>
                    <ul class="mt-2 divide-y divide-stroke text-sm">
                      <For each={eg()!.users} fallback={<li class="py-2 text-text-secondary">No users.</li>}>
                        {(u) => (
                          <li class="flex flex-wrap items-center justify-between gap-2 py-2">
                            <div>
                              <p class="font-medium">{u.full_name || u.email}</p>
                              <p class="text-xs text-slate-500">{u.email}</p>
                            </div>
                            <div class="text-right text-xs text-slate-500">
                              <p>In: {fmtWhen(u.last_login_at)}</p>
                              <p>Out: {fmtWhen(u.last_logout_at)} {u.last_end_reason ? `(${u.last_end_reason})` : ""}</p>
                              <p>Idle: {u.inactive_seconds != null ? fmtDuration(u.inactive_seconds) : "—"}</p>
                            </div>
                          </li>
                        )}
                      </For>
                    </ul>

                    <h3 class="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Recent sessions</h3>
                    <ul class="mt-2 space-y-2 text-sm">
                      <For each={eg()!.sessions} fallback={<li class="text-text-secondary">No sessions recorded yet.</li>}>
                        {(s) => (
                          <li class="rounded-lg border border-stroke p-3">
                            <div class="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p class="font-medium">{s.user_name}</p>
                                <p class="text-xs text-slate-500">
                                  {fmtWhen(s.started_at)} → {s.ended_at ? fmtWhen(s.ended_at) : "open"}
                                  {s.end_reason ? ` · ${s.end_reason}` : ""}
                                  {s.end_exact === false && s.end_reason ? " (inferred)" : ""}
                                </p>
                                <p class="text-xs text-slate-500">
                                  Active {fmtDuration(s.active_seconds)} · Idle {fmtDuration(s.idle_seconds)} · {s.page_view_count} pages
                                </p>
                              </div>
                              <button
                                type="button"
                                class="text-xs font-medium text-brand-600 hover:underline"
                                onClick={() => setOpenSessionId(openSessionId() === s.id ? null : s.id)}
                              >
                                {openSessionId() === s.id ? "Hide journey" : "Page journey"}
                              </button>
                            </div>
                            <Show when={openSessionId() === s.id}>
                              <Show when={sessionDetail.isFetching}>
                                <LoadingText class="mt-2 text-xs text-text-secondary" as="p" />
                              </Show>
                              <ol class="mt-2 space-y-1 border-t border-stroke pt-2 text-xs">
                                <For each={sessionDetail.data?.pages ?? []}>
                                  {(p) => (
                                    <li class="flex flex-wrap justify-between gap-2">
                                      <span>
                                        <span class="font-medium">{p.page_label || p.route_pattern}</span>
                                        <span class="ml-2 text-slate-400">{p.route_pattern}</span>
                                      </span>
                                      <span class="tabular-nums text-slate-500">
                                        {fmtDuration(p.active_seconds)}
                                        {p.idle_seconds ? ` (+${fmtDuration(p.idle_seconds)} idle)` : ""}
                                      </span>
                                    </li>
                                  )}
                                </For>
                              </ol>
                            </Show>
                          </li>
                        )}
                      </For>
                    </ul>
                  </Show>
                </section>

                <div>
                  <p class="mb-2 text-xs font-medium uppercase text-text-secondary">Activate paid plan</p>
                  <p class="mb-2 text-xs text-text-secondary">
                    Manual checkout: activating a plan also unlocks buy/sell and clears the QR paywall.
                  </p>
                  <div class="flex flex-wrap gap-2">
                    <For each={paidPlans()}>
                      {(p) => (
                        <button
                          type="button"
                          disabled={busy()}
                          class="rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
                          onClick={() =>
                            void act(`/api/v1/platform/console/customers/${id()}/subscriptions`, {
                              plan_id: p.id,
                              plan_kind: p.plan_code,
                            })
                          }
                        >
                          {planLabel(p)}
                          <Show when={p.promo_active}>
                            <span class="ml-1 opacity-90">(promo)</span>
                          </Show>
                        </button>
                      )}
                    </For>
                  </div>
                </div>

                <div class="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy()}
                    class="rounded-lg border border-stroke px-3 py-2 text-xs"
                    onClick={() => void act(`/api/v1/platform/console/customers/${id()}/extend-trial`, { days: 30 })}
                  >
                    Extend trial 30d
                  </button>
                  <button
                    type="button"
                    disabled={busy()}
                    class="rounded-lg border border-stroke px-3 py-2 text-xs"
                    onClick={() => void act(`/api/v1/platform/console/customers/${id()}/convert-demo`)}
                  >
                    Convert demo → trial
                  </button>
                </div>

                <section>
                  <h2 class="text-sm font-semibold">Subscriptions</h2>
                  <ul class="mt-2 space-y-2 text-sm">
                    <For each={d().subscriptions as Record<string, unknown>[]}>
                      {(s) => (
                        <li class="rounded-lg border border-stroke p-3">
                          {String(s.plan_kind)} · {String(s.status)}
                          {s.ends_at ? ` · ends ${String(s.ends_at).slice(0, 10)}` : ""}
                          · {formatPeso(Number(s.monthly_amount) || 0)}/mo
                          <button
                            type="button"
                            class="ml-3 text-xs text-brand-600 hover:underline"
                            onClick={() => {
                              const today = new Date().toISOString().slice(0, 10);
                              void act(`/api/v1/platform/console/subscriptions/${s.id}/invoices`, {
                                period_start: today,
                                period_end: today,
                                due_date: today,
                                amount: Number(s.monthly_amount) || undefined,
                              });
                            }}
                          >
                            Issue invoice
                          </button>
                        </li>
                      )}
                    </For>
                  </ul>
                </section>

                <section>
                  <h2 class="text-sm font-semibold">Invoices</h2>
                  <ul class="mt-2 space-y-2 text-sm">
                    <For each={d().invoices as Record<string, unknown>[]}>
                      {(inv) => (
                        <li class="flex items-center justify-between rounded-lg border border-stroke p-3">
                          <span>
                            {String(inv.invoice_no)} · {formatPeso(Number(inv.amount) || 0)} · {String(inv.status)}
                          </span>
                          <Show when={inv.status === "issued"}>
                            <button
                              type="button"
                              class="text-xs text-brand-600 hover:underline"
                              onClick={() => void act(`/api/v1/platform/console/invoices/${inv.id}/mark-paid`)}
                            >
                              Mark paid
                            </button>
                          </Show>
                        </li>
                      )}
                    </For>
                  </ul>
                </section>
              </div>
            );
          }}
        </Show>
      }>
        <LoadingText class="text-sm text-text-secondary" as="p" />
      </Show>
    </div>
  );
}
