import {
  createContext,
  createEffect,
  createSignal,
  onMount,
  useContext,
  type ParentProps,
} from "solid-js";
import { useViewportMode, type ViewportMode } from "./useViewportMode";

const STORAGE_KEY = "bluearm-sidebar-collapsed";

type ShellState = {
  /** Icon-only rail when true (false in drawer mode so labels show). */
  collapsed: () => boolean;
  toggleCollapsed: () => void;
  /** Explicit expand/collapse remembered (null = never set). */
  hasUserCollapsePref: () => boolean;
  sidebarWidth: () => string;
  mainMargin: () => string;
  drawerOpen: () => boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  viewport: ViewportMode;
};

const ShellContext = createContext<ShellState>();

export function ShellProvider(props: ParentProps) {
  const viewport = useViewportMode();
  const [collapsedPref, setCollapsedPref] = createSignal(false);
  const [prefLoaded, setPrefLoaded] = createSignal(false);
  const [hasPref, setHasPref] = createSignal(false);
  const [drawerOpen, setDrawerOpen] = createSignal(false);

  onMount(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === "1" || raw === "0") {
        setHasPref(true);
        setCollapsedPref(raw === "1");
      }
    } catch {
      /* ignore */
    }
    setPrefLoaded(true);
  });

  // Laptop (1024–1279): default collapsed rail if user never chose.
  createEffect(() => {
    if (!prefLoaded() || hasPref()) return;
    if (viewport.isLaptop()) {
      setCollapsedPref(true);
    }
  });

  // Close drawer when leaving narrow/standalone.
  createEffect(() => {
    if (!viewport.useDrawer()) setDrawerOpen(false);
  });

  const toggleCollapsed = () => {
    setCollapsedPref((v) => {
      const next = !v;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
        setHasPref(true);
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const value: ShellState = {
    collapsed: () => (viewport.useDrawer() ? false : collapsedPref()),
    toggleCollapsed,
    hasUserCollapsePref: () => hasPref(),
    sidebarWidth: () => {
      if (viewport.useDrawer()) return "18.125rem";
      return collapsedPref() ? "4.5rem" : "18.125rem";
    },
    mainMargin: () => {
      if (viewport.useDrawer()) return "ml-0";
      return collapsedPref() ? "ml-[4.5rem]" : "ml-[18.125rem]";
    },
    drawerOpen,
    openDrawer: () => setDrawerOpen(true),
    closeDrawer: () => setDrawerOpen(false),
    toggleDrawer: () => setDrawerOpen((v) => !v),
    viewport,
  };

  return <ShellContext.Provider value={value}>{props.children}</ShellContext.Provider>;
}

export function useShell() {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("ShellProvider missing");
  return ctx;
}

export { STORAGE_KEY as SIDEBAR_COLLAPSE_STORAGE_KEY };
