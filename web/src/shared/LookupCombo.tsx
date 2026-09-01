import { createEffect, createSignal, For, Show, onMount } from "solid-js";
import { inputClass } from "./SpreadsheetGrid";
import { LoadingText } from "../shared/LoadingText";
import { inputAriaProps } from "./formValidation";

export type LookupOption = { id: number; label: string; sublabel?: string; meta?: Record<string, unknown> };

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

export function LookupCombo(props: Props) {
  const [open, setOpen] = createSignal(false);
  const [options, setOptions] = createSignal<LookupOption[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [focused, setFocused] = createSignal(false);
  const [draft, setDraft] = createSignal("");
  let debounce: ReturnType<typeof setTimeout> | undefined;

  const displayValue = () => (focused() ? draft() : props.value());
  const aria = () =>
    inputAriaProps(props.fieldKey ?? props.label, {
      formId: props.formId ?? "lookup",
      error: props.error,
      description: props.description,
      required: props.required,
    });
  const listId = () => `${aria().id}-listbox`;

  createEffect(() => {
    if (!focused()) setDraft(props.value());
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
            setOpen(true);
            search(v);
          }}
          onBlur={() => {
            setFocused(false);
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
        <Show when={open() && (options().length > 0 || loading() || !!props.onCreate)}>
          <ul
            id={listId()}
            role="listbox"
            class="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-stroke bg-white py-1 shadow-lg"
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
        </Show>
      </div>
      <Show when={props.error}>
        <p id={aria().errorId} class="mt-1 text-xs text-red-600" role="alert">
          {props.error}
        </p>
      </Show>
    </div>
  );
}
