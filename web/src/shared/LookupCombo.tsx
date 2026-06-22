import { createSignal, For, Show, onMount } from "solid-js";
import { inputClass } from "./SpreadsheetGrid";

export type LookupOption = { id: number; label: string; sublabel?: string };

type Props = {
  label: string;
  value: () => string;
  selectedId: () => number | null;
  onInput: (text: string) => void;
  onSelect: (opt: LookupOption) => void;
  onClear: () => void;
  fetchOptions: (q: string) => Promise<LookupOption[]>;
  placeholder?: string;
  required?: boolean;
};

export function LookupCombo(props: Props) {
  const [open, setOpen] = createSignal(false);
  const [options, setOptions] = createSignal<LookupOption[]>([]);
  const [loading, setLoading] = createSignal(false);
  let debounce: ReturnType<typeof setTimeout> | undefined;

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

  onMount(() => {
    void search("");
  });

  return (
    <label class="block">
      <span class="mb-1 block text-sm font-medium text-text-primary">
        {props.label}
        {props.required ? " *" : ""}
      </span>
      <div class="relative">
        <input
          class={inputClass}
          value={props.value()}
          placeholder={props.placeholder ?? "Search…"}
          onFocus={() => {
            setOpen(true);
            void search(props.value());
          }}
          onInput={(e) => {
            props.onInput(e.currentTarget.value);
            setOpen(true);
            search(e.currentTarget.value);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        <Show when={props.selectedId()}>
          <button
            type="button"
            class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-text-secondary hover:text-red-600"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => props.onClear()}
          >
            Clear
          </button>
        </Show>
        <Show when={open() && (options().length > 0 || loading())}>
          <ul class="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-stroke bg-white py-1 shadow-lg">
            <Show when={loading()}>
              <li class="px-3 py-2 text-sm text-text-secondary">Loading…</li>
            </Show>
            <For each={options()}>
              {(opt) => (
                <li>
                  <button
                    type="button"
                    class="w-full px-3 py-2 text-left text-sm hover:bg-brand-50"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      props.onSelect(opt);
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
          </ul>
        </Show>
      </div>
    </label>
  );
}
