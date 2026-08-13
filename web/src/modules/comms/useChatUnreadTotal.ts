import { createSignal, onCleanup, onMount } from "solid-js";
import { hasPermission, useAuth } from "../../shared/auth-context";
import { fetchChatUnreadTotal } from "./chatApi";

/** Polls Team Chat unread total for the Communications sidebar badge. */
export function useChatUnreadTotal() {
  const auth = useAuth();
  const [total, setTotal] = createSignal(0);

  const canRead = () => hasPermission(auth.me, "comms.chat", "read");

  const refresh = async () => {
    if (!canRead()) {
      setTotal(0);
      return;
    }
    const res = await fetchChatUnreadTotal();
    if (res.success && res.data) {
      setTotal(Number(res.data.unread_total) || 0);
    }
  };

  onMount(() => {
    void refresh();
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    const t = window.setInterval(() => void refresh(), 60_000);
    onCleanup(() => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
      window.clearInterval(t);
    });
  });

  return { unreadTotal: total, refreshUnreadTotal: refresh };
}

export function formatChatUnreadBadge(n: number): string {
  if (n <= 0) return "";
  if (n > 99) return "99+";
  return String(n);
}
