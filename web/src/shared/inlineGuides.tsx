import {
  createSignal,
  createContext,
  useContext,
  onMount,
  type ParentProps,
  type Accessor,
  type JSX,
  Show,
} from "solid-js";

const STORAGE_KEY = "bluearm:ui.inline_guides";
const DISMISSED_KEY = "bluearm:ui.inline_tips_dismissed";
const VISIT_COUNT_KEY = "bluearm:ui.visit_count";

function readVisitCount(): number {
  try {
    const raw = localStorage.getItem(VISIT_COUNT_KEY);
    if (!raw) return 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function incrementUiVisitCount(): number {
  try {
    const next = readVisitCount() + 1;
    localStorage.setItem(VISIT_COUNT_KEY, String(next));
    return next;
  } catch {
    return 0;
  }
}

/** True when the user has explicitly chosen Show tips / Hide tips. */
export function hasInlineGuidesStoredPref(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === "0" || raw === "1";
  } catch {
    return false;
  }
}

function readEnabled(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "0") return false;
    if (raw === "1") return true;
    // Returning users: default tips off after enough sessions.
    return readVisitCount() <= 10;
  } catch {
    return readVisitCount() <= 10;
  }
}

function writeEnabled(value: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    /* private mode */
  }
}

function readDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function writeDismissed(ids: Set<string>) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
  } catch {
    /* private mode */
  }
}

type InlineGuidesCtx = {
  enabled: Accessor<boolean>;
  setEnabled: (value: boolean) => void;
  toggle: () => void;
  isTipDismissed: (tipId: string) => boolean;
  dismissTip: (tipId: string) => void;
};

const Ctx = createContext<InlineGuidesCtx>();

/**
 * Module-level fallback so header Tips and tip consumers stay in sync even if a
 * subtree misses InlineGuidesProvider (e.g. some Portal edge cases / tests).
 */
let sharedFallback: InlineGuidesCtx | undefined;

function buildCtx(
  enabled: Accessor<boolean>,
  setEnabledSignal: (v: boolean) => void,
  dismissed: Accessor<Set<string>>,
  setDismissed: (v: Set<string> | ((prev: Set<string>) => Set<string>)) => void,
): InlineGuidesCtx {
  const setEnabled = (value: boolean) => {
    setEnabledSignal(value);
    writeEnabled(value);
  };
  return {
    enabled,
    setEnabled,
    toggle: () => setEnabled(!enabled()),
    isTipDismissed: (tipId: string) => dismissed().has(tipId),
    dismissTip: (tipId: string) => {
      const id = tipId.trim();
      if (!id) return;
      setDismissed((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        writeDismissed(next);
        return next;
      });
    },
  };
}

function getSharedFallback(): InlineGuidesCtx {
  if (sharedFallback) return sharedFallback;
  const [enabled, setEnabledSignal] = createSignal(readEnabled());
  const [dismissed, setDismissed] = createSignal(readDismissed());
  sharedFallback = buildCtx(enabled, setEnabledSignal, dismissed, setDismissed);
  return sharedFallback;
}

/** Global Tips on/off for ModalFormGuide, InlineTip, StocksHowItFits — not workflow step n of n. */
export function InlineGuidesProvider(props: ParentProps) {
  onMount(() => {
    incrementUiVisitCount();
  });
  const [enabled, setEnabledSignal] = createSignal(readEnabled());
  const [dismissed, setDismissed] = createSignal(readDismissed());
  const value = buildCtx(enabled, setEnabledSignal, dismissed, setDismissed);
  const setEnabled = (v: boolean) => {
    value.setEnabled(v);
    getSharedFallback().setEnabled(v);
  };
  const ctx: InlineGuidesCtx = {
    ...value,
    setEnabled,
    toggle: () => setEnabled(!enabled()),
    dismissTip: (tipId: string) => {
      value.dismissTip(tipId);
      getSharedFallback().dismissTip(tipId);
    },
  };
  return <Ctx.Provider value={ctx}>{props.children}</Ctx.Provider>;
}

export function useInlineGuides(): InlineGuidesCtx {
  return useContext(Ctx) ?? getSharedFallback();
}

/** Reset module fallback between unit tests (localStorage + in-memory signal). */
export function resetInlineGuidesForTests() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(DISMISSED_KEY);
  } catch {
    /* private mode */
  }
  sharedFallback = undefined;
}

/** Wrap in-panel tip / how-it-fits copy so header Tips off hides it. Optional tipId enables Got it dismiss. */
export function InlineTip(props: { children: JSX.Element; class?: string; tipId?: string }) {
  const guides = useInlineGuides();
  const visible = () =>
    guides.enabled() && !(props.tipId && guides.isTipDismissed(props.tipId));
  return (
    <Show when={visible()}>
      <div class={props.class}>
        {props.children}
        <Show when={props.tipId}>
          <div class="mt-2">
            <button
              type="button"
              class="rounded border border-stroke bg-white px-2 py-0.5 text-xs font-medium text-text-secondary hover:bg-slate-50"
              onClick={() => guides.dismissTip(props.tipId!)}
            >
              Got it
            </button>
          </div>
        </Show>
      </div>
    </Show>
  );
}
