import { createContext, createSignal, onMount, useContext, type ParentProps } from "solid-js";

const STORAGE_KEY = "bluearm-sidebar-collapsed";

type ShellState = {
  collapsed: () => boolean;
  toggleCollapsed: () => void;
  sidebarWidth: () => string;
  mainMargin: () => string;
};

const ShellContext = createContext<ShellState>();

export function ShellProvider(props: ParentProps) {
  const [collapsed, setCollapsed] = createSignal(false);

  onMount(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* ignore */
    }
  });

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const value: ShellState = {
    collapsed,
    toggleCollapsed,
    sidebarWidth: () => (collapsed() ? "4.5rem" : "18.125rem"),
    mainMargin: () => (collapsed() ? "ml-[4.5rem]" : "ml-[18.125rem]"),
  };

  return <ShellContext.Provider value={value}>{props.children}</ShellContext.Provider>;
}

export function useShell() {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("ShellProvider missing");
  return ctx;
}
