import {
  createSignal,
  createContext,
  useContext,
  type ParentProps,
  type Accessor,
  type JSX,
  Show,
} from "solid-js";

const STORAGE_KEY = "bluearm:ui.inline_guides";

function readEnabled(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "0") return false;
    if (raw === "1") return true;
    return true; // default on
  } catch {
    return true;
  }
}

function writeEnabled(value: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    /* private mode */
  }
}

type InlineGuidesCtx = {
  enabled: Accessor<boolean>;
  setEnabled: (value: boolean) => void;
  toggle: () => void;
};

const Ctx = createContext<InlineGuidesCtx>();

/**
 * Module-level fallback so header Tips and tip consumers stay in sync even if a
 * subtree misses InlineGuidesProvider (e.g. some Portal edge cases / tests).
 */
let sharedFallback: InlineGuidesCtx | undefined;

function getSharedFallback(): InlineGuidesCtx {
  if (sharedFallback) return sharedFallback;
  const [enabled, setEnabledSignal] = createSignal(readEnabled());
  const setEnabled = (value: boolean) => {
    setEnabledSignal(value);
    writeEnabled(value);
  };
  sharedFallback = {
    enabled,
    setEnabled,
    toggle: () => setEnabled(!enabled()),
  };
  return sharedFallback;
}

/** Global Tips on/off for ModalFormGuide, InlineTip, StocksHowItFits — not workflow step n of n. */
export function InlineGuidesProvider(props: ParentProps) {
  const [enabled, setEnabledSignal] = createSignal(readEnabled());
  const setEnabled = (value: boolean) => {
    setEnabledSignal(value);
    writeEnabled(value);
    // Keep shared fallback aligned when both are used in one session.
    getSharedFallback().setEnabled(value);
  };
  const toggle = () => setEnabled(!enabled());
  return <Ctx.Provider value={{ enabled, setEnabled, toggle }}>{props.children}</Ctx.Provider>;
}

export function useInlineGuides(): InlineGuidesCtx {
  return useContext(Ctx) ?? getSharedFallback();
}

/** Reset module fallback between unit tests (localStorage + in-memory signal). */
export function resetInlineGuidesForTests() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode */
  }
  sharedFallback = undefined;
}

/** Wrap in-panel tip / how-it-fits copy so header Tips off hides it. */
export function InlineTip(props: { children: JSX.Element; class?: string }) {
  const guides = useInlineGuides();
  return (
    <Show when={guides.enabled()}>
      <div class={props.class}>{props.children}</div>
    </Show>
  );
}
