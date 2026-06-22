import { For, createContext, useContext, type ParentProps } from "solid-js";
import { createStore } from "solid-js/store";

export type ToastType = "success" | "error" | "warning";

type ToastItem = {
  id: number;
  type: ToastType;
  message: string;
};

type ToastAPI = {
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
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

  const push = (type: ToastType, message: string) => {
    const text = message.trim();
    if (!text) return;
    const id = ++nextToastId;
    setState("items", (items) => [...items, { id, type, message: text }]);
    window.setTimeout(() => dismiss(id), type === "error" ? 7000 : 5000);
  };

  const api: ToastAPI = {
    success: (message) => push("success", message),
    error: (message) => push("error", message),
    warning: (message) => push("warning", message),
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
              class={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${styles[toast.type]}`}
              role="alert"
            >
              <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/70 text-xs font-bold">
                {icons[toast.type]}
              </span>
              <p class="flex-1 leading-snug">{toast.message}</p>
              <button
                type="button"
                class="shrink-0 text-xs opacity-70 hover:opacity-100"
                aria-label="Dismiss notification"
                onClick={() => dismiss(toast.id)}
              >
                Dismiss
              </button>
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
