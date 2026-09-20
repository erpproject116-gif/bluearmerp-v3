import { createEffect, createSignal, For, Show, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import { inputClass } from "./SpreadsheetGrid";
import { LoadingText } from "../shared/LoadingText";
import { inputAriaProps } from "./formValidation";

export type LookupOption = { id: number; label: string; sublabel?: string; meta?: Record<string, unknown> };

type MenuPos = { top: number; left: number; width: number; maxHeight: number; placement: "below" | "above" };

type Props = {
  label: string;
  /** Appended to label text (e.g. " *" for required). */
  labelSuffix?: string;
  fieldKey?: string;
  formId?: string;
  description?: string;
  error?: string;
  value: () => string;
  selectedId: () => number | null;
  onInput: (text: string) => void;
  onSelect: (opt: LookupOption) => void;
  onClear: () => void;
  fetchOptions: (q: string) => Promise<LookupOption[]>;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  /** When provided, shows a create row in the dropdown with the current typed text. */
  onCreate?: (query: string) => void;
  createLabel?: string;
};

const MENU_MAX_H = 192; // max-h-48
/** Above EntityModal (z-50) and stacked EntityModal (z-[70]). */
const MENU_Z = "z-[80]";

export function LookupCombo(props: Props) {
  const [open, setOpen] = createSignal(false);
  const [options, setOptions] = createSignal<LookupOption[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [focused, setFocused] = createSignal(false);
  const [draft, setDraft] = createSignal("");
  const [menuPos, setMenuPos] = createSignal<MenuPos | null>(null);
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let inputEl: HTMLInputElement | undefined;

  const displayValue = () => (focused() ? draft() : props.value());
  const aria = () =>
    inputAriaProps(props.fieldKey ?? props.label, {
      formId: props.formId ?? "lookup",
      error: props.error,
      description: props.description,
      required: props.required,
    });
  const listId = () => `${aria().id}-listbox`;

  const showMenu = () => open() && (options().length > 0 || loading() || !!props.onCreate);

  const updateMenuPos = () => {
    const el = inputEl;
    if (!el) {
      setMenuPos(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const placement: "below" | "above" =
      spaceBelow < Math.min(MENU_MAX_H, 120) && spaceAbove > spaceBelow ? "above" : "below";
    const maxHeight = Math.max(96, Math.min(MENU_MAX_H, placement === "below" ? spaceBelow : spaceAbove));
    setMenuPos({
      top: placement === "below" ? rect.bottom + 4 : rect.top - 4,
      left: rect.left,
      width: rect.width,
      maxHeight,
      placement,
    });
  };

  createEffect(() => {
    if (!focused()) setDraft(props.value());
  });

  createEffect(() => {
    if (!showMenu()) {
      setMenuPos(null);
      return;
    }
    updateMenuPos();
    const onReposition = () => updateMenuPos();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("resize", onReposition);
    // Capture scroll from modal overflow containers as well as the window.
    window.addEventListener("scroll", onReposition, true);
    document.addEventListener("keydown", onKey, true);
    onCleanup(() => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
      document.removeEventListener("keydown", onKey, true);
    });
  });

  const search = (q: string) => {
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      setLoading(true);
      try {
        setOptions(await props.fetchOptions(q));
      } finally {
        setLoading(false);
      }
    }, 250);
  };

  const clearSelection = () => {
    setDraft("");
    props.onInput("");
    props.onClear();
    setOpen(false);
    setOptions([]);
  };

  const showClear = () =>
    !props.disabled && (props.selectedId() != null || displayValue().trim().length > 0);

  onMount(() => {
    void search("");
  });

  onCleanup(() => {
    clearTimeout(debounce);
  });

  return (
    <div class="block">
      <Show when={props.label}>
        <label class="mb-1 block text-sm font-medium text-text-primary" for={aria().id}>
          {props.label}
          <Show when={props.labelSuffix}>
            <span aria-hidden="true">{props.labelSuffix}</span>
          </Show>
          <Show when={props.required && !props.labelSuffix}>
            <span class="text-red-600" aria-hidden="true">
              {" "}
              *
            </span>
          </Show>
        </label>
      </Show>
      <Show when={props.description}>
        <p id={aria().hintId} class="mb-1 text-xs text-text-secondary">
          {props.description}
        </p>
      </Show>
      <div class="relative">
        <input
          ref={(el) => {
            inputEl = el;
          }}
          id={aria().id}
          class={`${inputClass} pr-14`}
          value={displayValue()}
          placeholder={props.placeholder ?? "Search…"}
          disabled={props.disabled}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open()}
          aria-controls={listId()}
          aria-invalid={aria()["aria-invalid"]}
          aria-describedby={aria()["aria-describedby"]}
          aria-required={aria()["aria-required"]}
          onFocus={() => {
            if (props.disabled) return;
            setDraft(props.value());
            setFocused(true);
            setOpen(true);
            void search(props.value());
          }}
          onInput={(e) => {
            if (props.disabled) return;
            const v = e.currentTarget.value;
            setDraft(v);
            props.onInput(v);
            // Typing invalidates a prior pick so save cannot keep a stale id with different text.
            if (props.selectedId() != null && v.trim() !== props.value().trim()) {
              props.onClear();
            }
            setOpen(true);
            search(v);
          }}
          onKeyDown={(e) => {
            if (props.disabled) return;
            if (e.key === "Enter") {
              e.preventDefault();
              const text = draft().trim().toLowerCase();
              const opts = options();
              const hit =
                opts.find((o) => o.label.toLowerCase() === text) ??
                opts.find((o) => {
                  const code = o.label.split("—")[0]?.trim().toLowerCase() ?? "";
                  return code === text || o.label.toLowerCase().startsWith(text + " —");
                }) ??
                opts.find((o) => o.label.toLowerCase().startsWith(text) && text.length >= 2) ??
                (opts.length === 1 ? opts[0] : undefined);
              if (hit) {
                props.onSelect(hit);
                setDraft(hit.label);
                setOpen(false);
              }
            }
          }}
          onBlur={() => {
            setFocused(false);
            const text = draft().trim();
            if (props.selectedId() == null && text) {
              const opts = options();
              const lower = text.toLowerCase();
              const hit =
                opts.find((o) => o.label.toLowerCase() === lower) ??
                opts.find((o) => {
                  const code = o.label.split("—")[0]?.trim().toLowerCase() ?? "";
                  return code === lower || o.label.toLowerCase().startsWith(lower + " —");
                });
              if (hit) {
                props.onSelect(hit);
                setDraft(hit.label);
              }
            }
            setTimeout(() => setOpen(false), 150);
          }}
        />
        <Show when={showClear()}>
          <button
            type="button"
            class="absolute right-2 top-1/2 z-10 -translate-y-1/2 text-xs text-text-secondary hover:text-red-600"
            tabIndex={-1}
            aria-label="Clear"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              clearSelection();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            Clear
          </button>
        </Show>
      </div>
      <Show when={showMenu() && menuPos()}>
        {(pos) => {
          const p = pos();
          const style =
            p.placement === "below"
              ? {
                  top: `${p.top}px`,
                  left: `${p.left}px`,
                  width: `${p.width}px`,
                  "max-height": `${p.maxHeight}px`,
                }
              : {
                  top: `${Math.max(8, p.top - p.maxHeight)}px`,
                  left: `${p.left}px`,
                  width: `${p.width}px`,
                  "max-height": `${p.maxHeight}px`,
                };
          return (
            <Portal>
              <ul
                id={listId()}
                role="listbox"
                class={`fixed ${MENU_Z} overflow-auto rounded-lg border border-stroke bg-white py-1 shadow-lg`}
                style={style}
              >
                <Show when={loading()}>
                  <LoadingText class="px-3 py-2 text-sm text-text-secondary" as="li" />
                </Show>
                <For each={options()}>
                  {(opt) => (
                    <li role="option">
                      <button
                        type="button"
                        class="w-full px-3 py-2 text-left text-sm hover:bg-brand-50"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          props.onSelect(opt);
                          setDraft(opt.label);
                          setOpen(false);
                        }}
                      >
                        <span class="font-medium text-text-primary">{opt.label}</span>
                        <Show when={opt.sublabel}>
                          <span class="ml-2 text-text-secondary">{opt.sublabel}</span>
                        </Show>
                      </button>
                    </li>
                  )}
                </For>
                <Show when={props.onCreate && displayValue().trim()}>
                  <li class="sticky bottom-0 border-t border-stroke bg-white">
                    <button
                      type="button"
                      class="flex w-full items-center gap-1 px-3 py-2 text-left text-sm font-medium text-brand-600 hover:bg-brand-50"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        const q = displayValue().trim();
                        if (!q) return;
                        props.onCreate!(q);
                        setOpen(false);
                      }}
                    >
                      <span class="text-base leading-none">+</span>
                      <span>
                        {props.createLabel ?? "Add new"} "{displayValue().trim()}"
                      </span>
                    </button>
                  </li>
                </Show>
              </ul>
            </Portal>
          );
        }}
      </Show>
      <Show when={props.error}>
        <p id={aria().errorId} class="mt-1 text-xs text-red-600" role="alert">
          {props.error}
        </p>
      </Show>
    </div>
  );
}
