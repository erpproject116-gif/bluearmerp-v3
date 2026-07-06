import { useLocation, useNavigate } from "@solidjs/router";
import type { ParentComponent } from "solid-js";
import { Show, createEffect } from "solid-js";
import { useAuth } from "./auth-context";
import { useSetupReadiness } from "./usePlatform";

const SETUP_PREFIX = "/app/setup";
const EXEMPT_PREFIXES = [
  SETUP_PREFIX,
  "/app/settings/branding",
  "/app/finance/chart-of-accounts",
  "/app/quotation/currencies",
  "/app/quotation/tax-types",
  "/app/inventory/locations",
  "/app/inventory/partners",
  "/app/inventory/items",
  "/app/user-management/users",
  "/app/documentation",
  "/app/onboarding",
];

function isExempt(path: string) {
  return EXEMPT_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

export const SetupGate: ParentComponent = (props) => {
  const loc = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  const readiness = useSetupReadiness();

  createEffect(() => {
    const path = loc.pathname;
    if (path.startsWith(SETUP_PREFIX) || isExempt(path)) return;
    const data = readiness.data;
    if (!data || data.required_complete) return;
    if (readiness.isLoading) return;
    const next = data.next_step?.href ?? `${SETUP_PREFIX}/company`;
    navigate(next, { replace: true });
  });

  return (
    <Show
      when={
        !readiness.isLoading &&
        readiness.data &&
        !readiness.data.required_complete &&
        !isExempt(loc.pathname) &&
        !loc.pathname.startsWith(SETUP_PREFIX) &&
        auth.me?.user?.tenant_role === "member"
      }
      fallback={props.children}
    >
      <div class="mx-auto max-w-lg p-8 text-center">
        <h1 class="text-lg font-semibold text-text-primary">Workspace setup in progress</h1>
        <p class="mt-2 text-sm text-text-secondary">
          Your administrator is still finishing the initial setup. You can browse the app, but
          transactions are locked until setup is complete.
        </p>
        {readiness.data?.blocking_reason && (
          <p class="mt-4 text-sm text-amber-700">{readiness.data.blocking_reason}</p>
        )}
      </div>
    </Show>
  );
};
