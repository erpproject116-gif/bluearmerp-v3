import { Show } from "solid-js";
import { useAuth } from "./auth-context";

const urgencyStyles: Record<string, string> = {
  trial_urgent: "bg-amber-50 border-amber-200 text-amber-900",
  trial_critical: "bg-red-50 border-red-200 text-red-900",
  demo_expiring_soon: "bg-amber-50 border-amber-200 text-amber-900",
  payment_overdue: "bg-red-50 border-red-200 text-red-900",
  trial_expired: "bg-red-50 border-red-200 text-red-900",
  demo_expired: "bg-red-50 border-red-200 text-red-900",
  renewal_due: "bg-amber-50 border-amber-200 text-amber-900",
};

export function EntitlementBanner() {
  const auth = useAuth();
  const ent = () => auth.me?.entitlement;

  return (
    <Show when={ent()?.message || (ent()?.days_remaining != null && ent()!.days_remaining! <= 14)}>
      <div
        class={`mb-4 rounded-lg border px-4 py-3 text-sm ${
          urgencyStyles[ent()?.urgency_label ?? ""] ?? "bg-brand-50 border-brand-200 text-brand-900"
        }`}
      >
        <Show
          when={ent()?.write_blocked}
          fallback={
            <p>
              {ent()?.plan_kind === "trial_90d" && ent()?.days_remaining != null
                ? `Trial: ${ent()!.days_remaining} day(s) remaining.`
                : ent()?.plan_kind === "demo" && ent()?.days_remaining != null
                  ? `Demo: ${ent()!.days_remaining} day(s) remaining.`
                  : ent()?.message}
            </p>
          }
        >
          <p class="font-medium">{ent()?.message}</p>
          <a href="/app/settings/billing" class="mt-1 inline-block text-sm underline">
            View billing
          </a>
        </Show>
      </div>
    </Show>
  );
}
