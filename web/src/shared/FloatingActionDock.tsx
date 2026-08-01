import { createSignal, onCleanup, onMount, Show, type JSX } from "solid-js";

const STORAGE_KEY = "erp.fabDock.position";
const DRAG_THRESHOLD_PX = 6;
const EDGE_PAD = 16;
const DEFAULT_RIGHT = 20;
const DEFAULT_BOTTOM = 20;

type Pos = { left: number; top: number };

function loadPos(): Pos | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Pos;
    if (typeof parsed.left !== "number" || typeof parsed.top !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function savePos(pos: Pos) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
  } catch {
    /* ignore quota */
  }
}

function defaultPos(dockW: number, dockH: number): Pos {
  return {
    left: Math.max(EDGE_PAD, window.innerWidth - dockW - DEFAULT_RIGHT),
    top: Math.max(EDGE_PAD, window.innerHeight - dockH - DEFAULT_BOTTOM),
  };
}

function clampPos(pos: Pos, dockW: number, dockH: number): Pos {
  const maxL = Math.max(EDGE_PAD, window.innerWidth - dockW - EDGE_PAD);
  const maxT = Math.max(EDGE_PAD, window.innerHeight - dockH - EDGE_PAD);
  return {
    left: Math.min(maxL, Math.max(EDGE_PAD, pos.left)),
    top: Math.min(maxT, Math.max(EDGE_PAD, pos.top)),
  };
}

type Props = {
  showSupport?: boolean;
  helpOpen: boolean;
  onHelpClick: () => void;
  onSupportClick: () => void;
};

export function FloatingActionDock(props: Props) {
  let dockEl: HTMLDivElement | undefined;
  const [pos, setPos] = createSignal<Pos | null>(null);
  const [dragging, setDragging] = createSignal(false);

  const measureAndClamp = (p: Pos) => {
    const w = dockEl?.offsetWidth ?? 48;
    const h = dockEl?.offsetHeight ?? 112;
    return clampPos(p, w, h);
  };

  const ensurePos = () => {
    const existing = pos();
    if (existing) {
      setPos(measureAndClamp(existing));
      return;
    }
    const stored = loadPos();
    const w = dockEl?.offsetWidth ?? 48;
    const h = dockEl?.offsetHeight ?? 112;
    setPos(measureAndClamp(stored ?? defaultPos(w, h)));
  };

  onMount(() => {
    ensurePos();
    const onResize = () => {
      const p = pos();
      if (p) setPos(measureAndClamp(p));
    };
    window.addEventListener("resize", onResize);
    onCleanup(() => window.removeEventListener("resize", onResize));
  });

  const resetPosition = () => {
    const w = dockEl?.offsetWidth ?? 48;
    const h = dockEl?.offsetHeight ?? 112;
    const next = defaultPos(w, h);
    setPos(next);
    savePos(next);
  };

  const startDrag = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("button[data-fab-action]")) {
      // Allow buttons to handle click; still track drag from dock chrome / buttons with threshold
    }
    const startX = e.clientX;
    const startY = e.clientY;
    const start = pos() ?? defaultPos(dockEl?.offsetWidth ?? 48, dockEl?.offsetHeight ?? 112);
    let moved = false;
    setDragging(true);

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      moved = true;
      setPos(measureAndClamp({ left: start.left + dx, top: start.top + dy }));
    };

    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setDragging(false);
      const final = pos();
      if (final) savePos(measureAndClamp(final));
      if (moved) {
        ev.preventDefault();
        (dockEl as HTMLElement | undefined)?.setAttribute("data-suppress-click", "1");
        queueMicrotask(() => dockEl?.removeAttribute("data-suppress-click"));
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const maybeClick = (action: () => void): JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent> => {
    return (e) => {
      if (dockEl?.getAttribute("data-suppress-click") === "1") {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      action();
    };
  };

  const style = (): JSX.CSSProperties => {
    const p = pos();
    if (!p) {
      return { bottom: `${DEFAULT_BOTTOM}px`, right: `${DEFAULT_RIGHT}px` };
    }
    return { left: `${p.left}px`, top: `${p.top}px` };
  };

  return (
    <div
      ref={(el) => {
        dockEl = el;
      }}
      class="fixed z-[58] flex flex-col items-center gap-2"
      classList={{ "cursor-grabbing": dragging(), "cursor-grab": !dragging() }}
      style={style()}
      onPointerDown={startDrag}
      onDblClick={resetPosition}
      title="Drag to move · Double-click to reset position"
      role="toolbar"
      aria-label="Help and support shortcuts"
    >
      <Show when={props.showSupport}>
        <button
          type="button"
          data-fab-action="support"
          class="flex h-12 w-12 items-center justify-center rounded-full border border-stroke bg-white text-brand-600 shadow-lg transition hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2"
          title="New support ticket"
          aria-label="Open new support ticket"
          onClick={maybeClick(props.onSupportClick)}
        >
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M4 7h16v12H4z" stroke-linejoin="round" />
            <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke-linecap="round" />
            <path d="M8 12h8M8 16h5" stroke-linecap="round" />
          </svg>
        </button>
      </Show>
      <button
        type="button"
        data-fab-action="help"
        class="flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2"
        aria-label={props.helpOpen ? "Close Baiko" : "Open Baiko"}
        aria-expanded={props.helpOpen}
        title="Baiko (Ctrl+Shift+H)"
        onClick={maybeClick(props.onHelpClick)}
      >
        <Show when={props.helpOpen} fallback={<span class="text-lg" aria-hidden="true">?</span>}>
          <span class="text-lg" aria-hidden="true">✕</span>
        </Show>
      </button>
    </div>
  );
}
