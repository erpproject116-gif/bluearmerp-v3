import { For, Show, createContext, useContext, onCleanup, type ParentProps } from "solid-js";
import { createStore } from "solid-js/store";
import { StatusIcon } from "./icons/StatusIcon";
import { openToastHelp, toastHelpAvailable } from "./toastHelpBridge";

export type ToastType = "success" | "error" | "warning" | "info";

export type ActionToastInput = {
  type?: ToastType;
  title: string;
  message?: string;
  actionLabel?: string;
  href?: string;
  onAction?: () => void;
  /** When true (default for blockers), toast stays until dismiss. */
  sticky?: boolean;
  /** Offer Ask Help using title + message. Default true for error/warning actions. */
  askHelp?: boolean;
};

type ToastItem = {
  id: number;
  type: ToastType;
  message: string;
  title?: string;
  actionLabel?: string;
  href?: string;
  onAction?: () => void;
  sticky?: boolean;
  askHelp?: boolean;
};

type ToastAPI = {
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
  /** Clickable toast with optional navigation or custom action. */
  action: (input: ActionToastInput) => void;
};

const ToastContext = createContext<ToastAPI>();

let globalToast: ToastAPI | null = null;

export function getGlobalToast(): ToastAPI | null {
  return globalToast;
}

let nextToastId = 0;

/** Exported for unit tests. */
export function toastDurationMs(opts: {
  type: ToastType;
  sticky?: boolean;
  hasTitle?: boolean;
  hasAction?: boolean;
}): number {
  if (opts.sticky) return 0;
  if (opts.type === "success") return 5000;
  if (opts.type === "info") return 5000;
  // Blockers with title or CTA: stay long enough to read / until dismiss.
  if (opts.hasTitle || opts.hasAction) return 0;
  if (opts.type === "error") return 20000;
  if (opts.type === "warning") return 20000;
  return 5000;
}

const styles: Record<ToastType, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  error: "border-red-200 bg-red-50 text-red-900",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
  info: "border-slate-200 bg-slate-50 text-slate-900",
};

export function ToastProvider(props: ParentProps) {
  const [state, setState] = createStore<{ items: ToastItem[] }>({ items: [] });
  const timers = new Map<number, number>();

  const dismiss = (id: number) => {
    const t = timers.get(id);
    if (t != null) {
      window.clearTimeout(t);
      timers.delete(id);
    }
    setState("items", (items) => items.filter((x) => x.id !== id));
  };

  onCleanup(() => {
    for (const t of timers.values()) window.clearTimeout(t);
    timers.clear();
  });

  const push = (item: Omit<ToastItem, "id">, durationMs: number) => {
    const text = item.message.trim();
    const title = item.title?.trim();
    if (!text && !title) return;
    const id = ++nextToastId;
    setState("items", (items) => [...items, { ...item, id }]);
    if (durationMs > 0) {
      timers.set(
        id,
        window.setTimeout(() => dismiss(id), durationMs),
      );
    }
  };

  const api: ToastAPI = {
    success: (message) => push({ type: "success", message }, 5000),
    error: (message) =>
      push(
        { type: "error", message, askHelp: true },
        toastDurationMs({ type: "error", hasTitle: false, hasAction: false }),
      ),
    warning: (message) =>
      push(
        { type: "warning", message, askHelp: true },
        toastDurationMs({ type: "warning", hasTitle: false, hasAction: false }),
      ),
    info: (message) => push({ type: "info", message }, 5000),
    action: (input) => {
      const type = input.type ?? "warning";
      const sticky = input.sticky ?? (type === "error" || type === "warning");
      const askHelp = input.askHelp ?? (type === "error" || type === "warning");
      push(
        {
          type,
          title: input.title,
          message: input.message ?? "",
          actionLabel: input.actionLabel ?? (input.href || input.onAction ? "View" : undefined),
          href: input.href,
          onAction: input.onAction,
          sticky,
          askHelp,
        },
        toastDurationMs({
          type,
          sticky,
          hasTitle: Boolean(input.title?.trim()),
          hasAction: Boolean(input.href || input.onAction),
        }),
      );
    },
  };

  globalToast = api;

  const runAction = (toast: ToastItem) => {
    toast.onAction?.();
    if (toast.href) {
      // Prefer in-app navigation so half-filled modals are not wiped by a full reload.
      const href = toast.href;
      if (href.startsWith("/") && !href.startsWith("//")) {
        window.history.pushState({}, "", href);
        window.dispatchEvent(new PopStateEvent("popstate"));
      } else {
        window.location.assign(href);
      }
    }
    dismiss(toast.id);
  };

  const runAskHelp = (toast: ToastItem) => {
    const q = [toast.title, toast.message].filter(Boolean).join(" — ");
    openToastHelp(q);
  };

  return (
    <ToastContext.Provider value={api}>
      {props.children}
      <div
        class="pointer-events-none fixed right-4 top-4 z-[100] flex w-full max-w-sm flex-col gap-2"
        aria-live="polite"
        aria-relevant="additions"
      >
        <For each={state.items}>
          {(toast) => (
            <div
              class={`pointer-events-auto rounded-xl border px-4 py-3 text-sm shadow-lg ${styles[toast.type]}`}
              role="alert"
            >
              <div class="flex items-start gap-3">
                <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                  <StatusIcon kind={toast.type} size="md" />
                </span>
                <div class="min-w-0 flex-1">
                  <Show when={toast.title}>
                    <p class="font-semibold leading-snug">{toast.title}</p>
                  </Show>
                  <Show when={toast.message}>
                    <p class="mt-0.5 leading-snug">{toast.message}</p>
                  </Show>
                  <div class="mt-2 flex flex-wrap gap-3">
                    <Show when={toast.href || toast.onAction}>
                      <button
                        type="button"
                        class="text-xs font-semibold underline underline-offset-2 hover:opacity-80"
                        onClick={() => runAction(toast)}
                      >
                        {toast.actionLabel ?? "View"}
                      </button>
                    </Show>
                    <Show when={toast.askHelp && toastHelpAvailable()}>
                      <button
                        type="button"
                        class="text-xs font-semibold underline underline-offset-2 hover:opacity-80"
                        onClick={() => runAskHelp(toast)}
                      >
                        Ask Help
                      </button>
                    </Show>
                  </div>
                </div>
                <button
                  type="button"
                  class="shrink-0 text-xs opacity-70 hover:opacity-100"
                  aria-label="Dismiss notification"
                  onClick={() => dismiss(toast.id)}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </For>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastAPI {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("ToastProvider missing");
  return ctx;
}

export function useToastOptional(): ToastAPI | null {
  return useContext(ToastContext) ?? null;
}
