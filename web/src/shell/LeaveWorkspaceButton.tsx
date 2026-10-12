import { createSignal, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { hasPlatformPermission, useAuth } from "../shared/auth-context";
import { setActiveTenantId } from "../shared/activeContext";
import { endSupportSessionById, restoredTenantId } from "../shared/leaveSupportSession";
import { useToast } from "../shared/toast";

/** Agent-only control. Hidden unless this login has platform.support.access and an open support session. */
export function LeaveWorkspaceButton(props: { variant: "header" | "menu"; onDone?: () => void }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = createSignal(false);

  const session = () => {
    const s = auth.me?.support_session;
    if (!s || !hasPlatformPermission(auth.me, "platform.support.access")) return undefined;
    return s;
  };

  const leave = async () => {
    const s = session();
    if (!s || busy()) return;
    setBusy(true);
    try {
      const ended = await endSupportSessionById(s.id);
      if (!ended.ok) {
        toast.error(ended.message);
        return;
      }
      setActiveTenantId(restoredTenantId(s.previous_active_tenant_id, auth.me?.memberships));
      await auth.refresh();
      props.onDone?.();
      navigate(`/app/platform-command/customers/${s.customer_id}`, { replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Show when={session()}>
      <Show
        when={props.variant === "header"}
        fallback={
          <button
            type="button"
            role="menuitem"
            class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-text-secondary transition hover:erp-panel hover:text-text-primary disabled:opacity-50"
            disabled={busy()}
            onClick={() => void leave()}
          >
            Leave workspace
          </button>
        }
      >
        <button
          type="button"
          class="inline-flex items-center rounded-lg border border-stroke px-2.5 py-1.5 text-sm font-medium text-text-primary transition hover:bg-slate-50 disabled:opacity-50"
          disabled={busy()}
          onClick={() => void leave()}
        >
          Leave workspace
        </button>
      </Show>
    </Show>
  );
}
