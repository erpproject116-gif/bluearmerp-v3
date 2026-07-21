export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "bluearm-theme";

export function readThemePreference(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return "light";
}

export function writeThemePreference(value: ThemePreference) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
}

export function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveTheme(pref: ThemePreference = readThemePreference()): "light" | "dark" {
  if (pref === "system") return systemPrefersDark() ? "dark" : "light";
  return pref;
}

/** Apply data-theme on <html> for CSS token overrides. */
export function applyResolvedTheme(pref: ThemePreference = readThemePreference()) {
  const resolved = resolveTheme(pref);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  return resolved;
}

export function setThemePreference(pref: ThemePreference) {
  writeThemePreference(pref);
  return applyResolvedTheme(pref);
}
