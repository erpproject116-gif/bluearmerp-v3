import { For, Show, createSignal } from "solid-js";
import { apiFetch } from "../../shared/api";
import { useToast } from "../../shared/toast";
import { usePlatformMultiMemberships, usePlatformStaff, usePlatformStaffInvites } from "../../shared/usePlatform";

const ROLES = [
  "support_viewer",
  "support_agent",
  "onboarding_specialist",
  "customer_success",
  "billing_operator",
  "superadmin",
];

export default function PlatformAccessPage() {
  const toast = useToast();
  const staff = usePlatformStaff();
  const invites = usePlatformStaffInvites();
  const multi = usePlatformMultiMemberships();
  const [email, setEmail] = createSignal("");
  const [fullName, setFullName] = createSignal("");
  const [role, setRole] = createSignal("support_viewer");
  const [saving, setSaving] = createSignal(false);

  const invite = async () => {
    setSaving(true);
    const res = await apiFetch("/api/v1/platform/console/staff/invites", {
      method: "POST",
      body: JSON.stringify({ email: email().trim(), full_name: fullName().trim(), role: role() }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.warning(res.message ?? "Could not invite.");
      return;
    }
    toast.success((res.data as { message?: string })?.message ?? "Invite created.");
    setEmail("");
    setFullName("");
    invites.refetch();
  };

  const revoke = async (id: number) => {
    const res = await apiFetch(`/api/v1/platform/console/staff/invites/${id}/revoke`, { method: "POST" });
    if (!res.ok) {
      toast.warning(res.message ?? "Could not revoke.");
      return;
    }
    invites.refetch();
  };

  return (
    <div class="space-y-6">
      <div>
        <h2 class="text-xl font-semibold">Staff & access</h2>
        <p class="mt-1 text-sm text-slate-500">
          Invite platform staff by Google email. They sign in with Google — no user ID entry. Customer policy: one email
          → one customer business (platform staff are a separate lane).
        </p>
      </div>

      <section class="rounded-xl border border-slate-200 bg-white p-4">
        <h3 class="mb-3 text-sm font-semibold">Invite staff</h3>
        <div class="flex flex-wrap gap-2">
          <input class="rounded-lg border px-3 py-2 text-sm" placeholder="Email" value={email()} onInput={(e) => setEmail(e.currentTarget.value)} />
          <input class="rounded-lg border px-3 py-2 text-sm" placeholder="Full name" value={fullName()} onInput={(e) => setFullName(e.currentTarget.value)} />
          <select class="rounded-lg border px-3 py-2 text-sm" value={role()} onChange={(e) => setRole(e.currentTarget.value)}>
            <For each={ROLES}>{(r) => <option value={r}>{r}</option>}</For>
          </select>
          <button type="button" class="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-40" disabled={saving()} onClick={() => void invite()}>
            Send invite
          </button>
        </div>
      </section>

      <section class="rounded-xl border border-slate-200 bg-white p-4">
        <h3 class="mb-2 text-sm font-semibold">Role matrix (what each role can do)</h3>
        <ul class="space-y-1.5 text-xs text-slate-600">
          <li><strong>support_viewer</strong> — read customers, tickets, onboarding, follow-ups (no writes).</li>
          <li><strong>support_agent</strong> — tickets + follow-ups write; access logs.</li>
          <li><strong>onboarding_specialist / customer_success</strong> — CS playbook, quick follow-ups, customer ops (per role grants).</li>
          <li><strong>billing_operator</strong> — extend trial, subscriptions, invoices.</li>
          <li><strong>superadmin</strong> — all platform permissions including staff invites.</li>
        </ul>
        <p class="mt-2 text-xs text-slate-500">
          Follow-up SLA defaults to 48 hours; overdue items rank first on the Command overview.
        </p>
      </section>

      <section class="rounded-xl border border-amber-200 bg-amber-50/40">
        <h3 class="border-b border-amber-200 px-4 py-3 text-sm font-semibold text-amber-950">
          Grandfathered multi-membership emails
        </h3>
        <p class="border-b border-amber-100 px-4 py-2 text-xs text-amber-900/80">
          {multi.data?.note ??
            "Read-only list of emails with more than one active customer workspace. New second links are blocked."}
        </p>
        <ul class="divide-y divide-amber-100">
          <Show when={!multi.data?.rows?.length}>
            <li class="px-4 py-3 text-sm text-slate-500">None found — all active emails map to a single business.</li>
          </Show>
          <For each={multi.data?.rows ?? []}>
            {(row) => (
              <li class="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                <span class="font-mono text-xs">{row.email}</span>
                <span class="text-slate-600">
                  {row.tenant_count} tenants · {(row.company_codes ?? []).join(", ")}
                </span>
              </li>
            )}
          </For>
        </ul>
      </section>

      <section class="rounded-xl border border-slate-200 bg-white">
        <h3 class="border-b px-4 py-3 text-sm font-semibold">Active staff</h3>
        <ul class="divide-y">
          <For each={staff.data ?? []}>
            {(u) => (
              <li class="flex justify-between px-4 py-2 text-sm">
                <span>{u.full_name} · {u.email}</span>
                <span class="text-slate-500">{u.role}{u.is_active ? "" : " (disabled)"}</span>
              </li>
            )}
          </For>
        </ul>
      </section>

      <section class="rounded-xl border border-slate-200 bg-white">
        <h3 class="border-b px-4 py-3 text-sm font-semibold">Pending invites</h3>
        <ul class="divide-y">
          <Show when={(invites.data ?? []).filter((i) => !i.accepted_at && !i.revoked_at).length === 0}>
            <li class="px-4 py-3 text-sm text-slate-500">No pending invites.</li>
          </Show>
          <For each={(invites.data ?? []).filter((i) => !i.accepted_at && !i.revoked_at)}>
            {(i) => (
              <li class="flex items-center justify-between px-4 py-2 text-sm">
                <span>{i.email} · {i.role} · expires {new Date(i.expires_at).toLocaleDateString()}</span>
                <button type="button" class="text-xs text-rose-700 hover:underline" onClick={() => void revoke(i.id)}>Revoke</button>
              </li>
            )}
          </For>
        </ul>
      </section>
    </div>
  );
}
