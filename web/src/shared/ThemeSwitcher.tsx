import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import {
  applyResolvedTheme,
  readThemePreference,
  setThemePreference,
  type ThemePreference,
} from "./theme-preference";
import { useBranding } from "./branding/BrandingProvider";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

type Props = {
  /** When true, render a full-width menu row with a Theme text label. */
  labeled?: boolean;
};

/** Light / Dark / System control for the shell header or account menu. */
export function ThemeSwitcher(props: Props = {}) {
  const branding = useBranding();
  const [pref, setPref] = createSignal<ThemePreference>(readThemePreference());
  const [open, setOpen] = createSignal(false);
  let root: HTMLDivElement | undefined;

  onMount(() => {
    applyResolvedTheme(pref());
    branding.reapplyTheme();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (readThemePreference() === "system") {
        applyResolvedTheme("system");
        branding.reapplyTheme();
      }
    };
    mq.addEventListener("change", onChange);
    const onDoc = (e: MouseEvent) => {
      if (!root?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    onCleanup(() => {
      mq.removeEventListener("change", onChange);
      document.removeEventListener("click", onDoc);
    });
  });

  const choose = (value: ThemePreference) => {
    setPref(value);
    setThemePreference(value);
    branding.reapplyTheme();
    setOpen(false);
  };

  const prefLabel = () => OPTIONS.find((o) => o.value === pref())?.label ?? "Theme";

  const icon = (
    <Show
      when={pref() === "dark"}
      fallback={
        <Show
          when={pref() === "system"}
          fallback={
            <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"
              />
            </svg>
          }
        >
          <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M9 17.25v1.007a1 1 0 01-.97 1.002C5.887 19.37 3 16.86 3 12.75 3 8.16 6.66 4.5 11.25 4.5c.414 0 .75.336.75.75v.007a8.25 8.25 0 018.243 8.243c0 .414-.336.75-.75.75h-.007A8.25 8.25 0 019 17.25z"
            />
          </svg>
        </Show>
      }
    >
      <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"
        />
      </svg>
    </Show>
  );

  return (
    <div class="relative" classList={{ "w-full": props.labeled }} ref={root}>
      <button
        type="button"
        role={props.labeled ? "menuitem" : undefined}
        class={
          props.labeled
            ? "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-text-secondary transition hover:erp-panel hover:text-text-primary"
            : "rounded-lg border border-stroke p-2 text-text-secondary transition hover:erp-panel hover:text-text-primary"
        }
        aria-label="Theme"
        aria-expanded={open()}
        title="Theme"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        {icon}
        <Show when={props.labeled}>
          <span class="min-w-0 flex-1">Theme</span>
          <span class="text-xs font-normal text-text-secondary">{prefLabel()}</span>
        </Show>
      </button>
      <Show when={open()}>
        <div
          class="absolute z-50 mt-1 min-w-[8rem] rounded-lg border border-stroke bg-surface py-1 shadow-lg"
          classList={{
            "left-0 right-0": props.labeled,
            "right-0": !props.labeled,
          }}
        >
          <For each={OPTIONS}>
            {(opt) => (
              <button
                type="button"
                class="block w-full px-3 py-2 text-left text-sm transition-colors"
                classList={{
                  "bg-brand-50 text-brand-600": pref() === opt.value,
                  "text-text-secondary hover:erp-panel hover:text-text-primary": pref() !== opt.value,
                }}
                onClick={() => choose(opt.value)}
              >
                {opt.label}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
