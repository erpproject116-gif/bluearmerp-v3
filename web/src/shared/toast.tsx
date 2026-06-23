import { For, Show, createContext, useContext, type ParentProps } from "solid-js";
import { createStore } from "solid-js/store";

export type ToastType = "success" | "error" | "warning";

export type ActionToastInput = {
  type?: ToastType;
  title: string;
  message?: string;
  actionLabel?: string;
  href?: string;
  onAction?: () => void;
};

type ToastItem = {
  id: number;
  type: ToastType;
  message: string;
  title?: string;
  actionLabel?: string;
  href?: string;
  onAction?: () => void;
};

type ToastAPI = {
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  /** Clickable toast with optional navigation or custom action. */
  action: (input: ActionToastInput) => void;
};

const ToastContext = createContext<ToastAPI>();

let nextToastId = 0;

const styles: Record<ToastType, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  error: "border-red-200 bg-red-50 text-red-900",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
};

const icons: Record<ToastType, string> = {
  success: "✓",
  error: "✕",
  warning: "!",
};

export function ToastProvider(props: ParentProps) {
  const [state, setState] = createStore<{ items: ToastItem[] }>({ items: [] });

  const dismiss = (id: number) => {
    setState("items", (items) => items.filter((t) => t.id !== id));
  };

  const push = (item: Omit<ToastItem, "id">, durationMs: number) => {
    const text = item.message.trim();
    const title = item.title?.trim();
    if (!text && !title) return;
    const id = ++nextToastId;
    setState("items", (items) => [...items, { ...item, id }]);
    window.setTimeout(() => dismiss(id), durationMs);
  };

  const api: ToastAPI = {
    success: (message) => push({ type: "success", message }, 5000),
    error: (message) => push({ type: "error", message }, 7000),
    warning: (message) => push({ type: "warning", message }, 5000),
    action: (input) =>
      push(
        {
          type: input.type ?? "warning",
          title: input.title,
          message: input.message ?? "",
          actionLabel: input.actionLabel ?? "View",
          href: input.href,
          onAction: input.onAction,
        },
        input.type === "error" ? 12000 : 10000,
      ),
  };

  const runAction = (toast: ToastItem) => {
    toast.onAction?.();
    if (toast.href) {
      window.location.assign(toast.href);
    }
    dismiss(toast.id);
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
                <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/70 text-xs font-bold">
                  {icons[toast.type]}
                </span>
                <div class="min-w-0 flex-1">
                  <Show when={toast.title}>
                    <p class="font-semibold leading-snug">{toast.title}</p>
                  </Show>
                  <Show when={toast.message}>
                    <p class="mt-0.5 leading-snug">{toast.message}</p>
                  </Show>
                  <Show when={toast.href || toast.onAction}>
                    <button
                      type="button"
                      class="mt-2 text-xs font-semibold underline underline-offset-2 hover:opacity-80"
                      onClick={() => runAction(toast)}
                    >
                      {toast.actionLabel ?? "View"}
                    </button>
                  </Show>
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
