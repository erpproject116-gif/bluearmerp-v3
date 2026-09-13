import { createEffect, createSignal, onCleanup, onMount } from "solid-js";

export type ViewportBand = "xl" | "laptop" | "narrow";

export type ViewportMode = {
  band: () => ViewportBand;
  /** >= 1280 */
  isXl: () => boolean;
  /** 1024–1279 */
  isLaptop: () => boolean;
  /** < 1024 */
  isNarrow: () => boolean;
  /** Installed PWA / Add to Home Screen */
  isStandalone: () => boolean;
  /** Drawer chrome: narrow or standalone */
  useDrawer: () => boolean;
};

function readBand(width: number): ViewportBand {
  if (width >= 1280) return "xl";
  if (width >= 1024) return "laptop";
  return "narrow";
}

function readStandalone(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    // iOS Safari Add to Home Screen
    const nav = window.navigator as Navigator & { standalone?: boolean };
    return Boolean(nav.standalone);
  } catch {
    return false;
  }
}

/** Shared breakpoint + PWA display-mode contract for AppShell / floor nav. */
export function useViewportMode(): ViewportMode {
  const [band, setBand] = createSignal<ViewportBand>(
    typeof window !== "undefined" ? readBand(window.innerWidth) : "xl",
  );
  const [standalone, setStandalone] = createSignal(false);

  onMount(() => {
    setBand(readBand(window.innerWidth));
    setStandalone(readStandalone());

    const onResize = () => setBand(readBand(window.innerWidth));
    window.addEventListener("resize", onResize);

    let mq: MediaQueryList | null = null;
    const onDisplayMode = () => setStandalone(readStandalone());
    try {
      mq = window.matchMedia("(display-mode: standalone)");
      mq.addEventListener("change", onDisplayMode);
    } catch {
      /* ignore */
    }

    onCleanup(() => {
      window.removeEventListener("resize", onResize);
      mq?.removeEventListener("change", onDisplayMode);
    });
  });

  return {
    band,
    isXl: () => band() === "xl",
    isLaptop: () => band() === "laptop",
    isNarrow: () => band() === "narrow",
    isStandalone: () => standalone(),
    useDrawer: () => band() === "narrow" || standalone(),
  };
}

/** One-shot default collapse for laptop band when user never chose expand/collapse. */
export function applyLaptopDefaultCollapse(
  setCollapsed: (v: boolean) => void,
  storageKey: string,
  isLaptop: () => boolean,
) {
  createEffect(() => {
    if (!isLaptop()) return;
    try {
      if (localStorage.getItem(storageKey) == null) {
        setCollapsed(true);
      }
    } catch {
      /* ignore */
    }
  });
}
