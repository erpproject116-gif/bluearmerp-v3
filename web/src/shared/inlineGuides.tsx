import { createSignal, createContext, useContext, type ParentProps, type Accessor } from "solid-js";

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

/** Global Tips on/off for ModalFormGuide, StocksHowItFits, and similar in-panel copy — not workflow step n of n. */
export function InlineGuidesProvider(props: ParentProps) {
  const [enabled, setEnabledSignal] = createSignal(readEnabled());
  const setEnabled = (value: boolean) => {
    setEnabledSignal(value);
    writeEnabled(value);
  };
  const toggle = () => setEnabled(!enabled());
  return <Ctx.Provider value={{ enabled, setEnabled, toggle }}>{props.children}</Ctx.Provider>;
}

export function useInlineGuides(): InlineGuidesCtx {
  const ctx = useContext(Ctx);
  if (ctx) return ctx;
  // Fallback when provider missing (tests / isolated trees)
  const [enabled, setEnabledSignal] = createSignal(readEnabled());
  return {
    enabled,
    setEnabled: (v) => {
      setEnabledSignal(v);
      writeEnabled(v);
    },
    toggle: () => {
      const next = !enabled();
      setEnabledSignal(next);
      writeEnabled(next);
    },
  };
}
