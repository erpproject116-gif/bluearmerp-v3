import { useLocation } from "@solidjs/router";
import {
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  Show,
  useContext,
  type ParentProps,
} from "solid-js";
import { HelpAssistantPanel } from "./HelpAssistantPanel";
import { useHelpAssistant } from "./useHelpAssistant";
import { FloatingActionDock } from "../../shared/FloatingActionDock";
import { NewSupportTicketModal } from "../support/NewSupportTicketModal";
import { canViewCrm, hasPermission, useAuth } from "../../shared/auth-context";
import { isTenantModuleEnabled } from "../../shared/moduleAccess";

type HelpAssistantUi = {
  open: () => boolean;
  toggle: () => void;
  openWithQuery: (query: string) => void;
};

const HelpAssistantContext = createContext<HelpAssistantUi>();

export function HelpAssistantProvider(props: ParentProps) {
  const loc = useLocation();
  const auth = useAuth();
  const assistant = useHelpAssistant(() => loc.pathname);
  const [open, setOpen] = createSignal(false);
  const [queuedQuery, setQueuedQuery] = createSignal<string | null>(null);
  const [ticketOpen, setTicketOpen] = createSignal(false);

  const toggle = () => setOpen((v) => !v);

  const openWithQuery = (query: string) => {
    const q = query.trim();
    setOpen(true);
    if (q) setQueuedQuery(q);
  };

  const showSupportFab = () => {
    if (!auth.me) return false;
    if (!isTenantModuleEnabled(auth.me, "support")) return false;
    if (!canViewCrm(auth.me)) return false;
    return hasPermission(auth.me, "support.tickets_new", "write");
  };

  createEffect(() => {
    if (!open() || !queuedQuery()) return;
    const q = queuedQuery()!;
    setQueuedQuery(null);
    queueMicrotask(() => assistant.ask(q));
  });

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.key.toLowerCase() !== "h") return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  const value: HelpAssistantUi = { open, toggle, openWithQuery };

  return (
    <HelpAssistantContext.Provider value={value}>
      {props.children}
      <FloatingActionDock
        showSupport={showSupportFab()}
        helpOpen={open()}
        onHelpClick={toggle}
        onSupportClick={() => setTicketOpen(true)}
      />
      <HelpAssistantPanel open={open()} onClose={() => setOpen(false)} assistant={assistant} />
      <Show when={showSupportFab()}>
        <NewSupportTicketModal open={ticketOpen()} onClose={() => setTicketOpen(false)} />
      </Show>
    </HelpAssistantContext.Provider>
  );
}

export function useHelpAssistantUi() {
  return useContext(HelpAssistantContext);
}
