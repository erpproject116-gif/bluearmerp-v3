import { onMount } from "solid-js";
import { useAuth } from "./auth-context";
import { getGlobalToast } from "./toast";

const ACK_PREFIX = "erp.joinedCompanyAck:";

/** One-time toast after invite join: confirms the company name in the sidebar context. */
export function JoinCompanyConfirm() {
  const auth = useAuth();

  onMount(() => {
    const me = auth.me;
    if (!me?.tenant?.id || !me.user?.id) return;
    const pendingKey = `erp.joinedCompany:${me.tenant.id}:${me.user.id}`;
    const ackKey = `${ACK_PREFIX}${me.tenant.id}:${me.user.id}`;
    try {
      if (sessionStorage.getItem(ackKey)) return;
      const pending = sessionStorage.getItem(pendingKey);
      if (!pending) return;
      const name = me.tenant.company_name?.trim() || (pending !== "1" ? pending : "your company");
      getGlobalToast()?.success(`Joined ${name}`);
      sessionStorage.setItem(ackKey, "1");
      sessionStorage.removeItem(pendingKey);
    } catch {
      /* ignore storage errors */
    }
  });

  return null;
}
