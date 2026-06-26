import type { BrandingSettings } from "./types";
import { STAGE_KEYS } from "./defaults";

function setVar(root: HTMLElement, name: string, value?: string) {
  if (value?.trim()) root.style.setProperty(name, value.trim());
}

export function applyBrandingTheme(settings: BrandingSettings) {
  const root = document.documentElement;
  const body = document.body;
  const c = settings.colors;
  setVar(root, "--color-brand-500", c.primary);
  setVar(root, "--color-brand-600", c.primary);
  setVar(root, "--color-brand-700", c.primary_hover || c.primary);
  setVar(root, "--color-brand-50", mixWithWhite(c.primary, 0.92));
  setVar(root, "--color-brand-100", mixWithWhite(c.primary, 0.85));
  setVar(root, "--color-text-primary", c.heading || c.text);
  setVar(root, "--color-text-secondary", c.text_secondary);
  setVar(root, "--color-body", c.background);
  setVar(root, "--color-stroke", c.stroke);
  setVar(root, "--color-accent", c.accent);
  setVar(root, "--color-secondary", c.secondary);
  setVar(root, "--color-label", c.label);
  setVar(root, "--color-surface", c.surface);

  if (body) {
    if (c.background?.trim()) body.style.backgroundColor = c.background.trim();
    if ((c.heading || c.text)?.trim()) body.style.color = (c.heading || c.text).trim();
  }

  for (const key of STAGE_KEYS) {
    const stage = settings.stages[key];
    if (!stage) continue;
    setVar(root, `--stage-${key.replace(/_/g, "-")}-bg`, stage.bg);
    setVar(root, `--stage-${key.replace(/_/g, "-")}-text`, stage.text);
  }
}

function mixWithWhite(hex: string, whiteRatio: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = (ch: number) => Math.round(ch * (1 - whiteRatio) + 255 * whiteRatio);
  const out = (mix(r) << 16) | (mix(g) << 8) | mix(b);
  return `#${out.toString(16).padStart(6, "0")}`;
}
