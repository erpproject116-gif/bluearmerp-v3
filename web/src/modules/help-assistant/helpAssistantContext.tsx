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

type HelpAssistantUi = {
  open: () => boolean;
  toggle: () => void;
  openWithQuery: (query: string) => void;
};

const HelpAssistantContext = createContext<HelpAssistantUi>();

export function HelpAssistantProvider(props: ParentProps) {
  const loc = useLocation();
  const assistant = useHelpAssistant(() => loc.pathname);
  const [open, setOpen] = createSignal(false);
  const [queuedQuery, setQueuedQuery] = createSignal<string | null>(null);

  const toggle = () => setOpen((v) => !v);

  const openWithQuery = (query: string) => {
    const q = query.trim();
    setOpen(true);
    if (q) setQueuedQuery(q);
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
      <button
        type="button"
        class="fixed bottom-5 right-5 z-[58] flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2"
        aria-label={open() ? "Close help assistant" : "Open help assistant"}
        aria-expanded={open()}
        title="Help assistant (Ctrl+Shift+H)"
        onClick={toggle}
      >
        <Show when={open()} fallback={<span class="text-lg" aria-hidden="true">?</span>}>
          <span class="text-lg" aria-hidden="true">✕</span>
        </Show>
      </button>
      <HelpAssistantPanel open={open()} onClose={() => setOpen(false)} assistant={assistant} />
    </HelpAssistantContext.Provider>
  );
}

export function useHelpAssistantUi() {
  return useContext(HelpAssistantContext);
}
