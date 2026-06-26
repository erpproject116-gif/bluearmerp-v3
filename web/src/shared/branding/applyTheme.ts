import type { BrandingSettings } from "./types";
import { STAGE_KEYS } from "./defaults";

function setVar(root: HTMLElement, name: string, value?: string) {
  if (value?.trim()) root.style.setProperty(name, value.trim());
}

export function applyBrandingTheme(settings: BrandingSettings) {
  const root = document.documentElement;
  const body = document.body;
  const c = settings.colors;
  const primary = c.primary?.trim() || "#3c50e0";
  const surface = c.surface?.trim() || "#ffffff";
  const background = c.background?.trim() || "#f1f5f9";
  const stroke = c.stroke?.trim() || "#e2e8f0";

  setVar(root, "--color-brand-500", primary);
  setVar(root, "--color-brand-600", primary);
  setVar(root, "--color-brand-700", c.primary_hover || primary);
  setVar(root, "--color-brand-50", mixWithWhite(primary, 0.92));
  setVar(root, "--color-brand-100", mixWithWhite(primary, 0.85));
  setVar(root, "--color-text-primary", c.heading || c.text);
  setVar(root, "--color-text-secondary", c.text_secondary);
  setVar(root, "--color-body", background);
  setVar(root, "--color-stroke", stroke);
  setVar(root, "--color-accent", c.accent);
  setVar(root, "--color-secondary", c.secondary);
  setVar(root, "--color-label", c.label);
  setVar(root, "--color-surface", surface);
  setVar(root, "--color-panel", mixHex(surface, background, 0.35));
  setVar(root, "--color-panel-strong", mixHex(surface, stroke, 0.55));

  if (body) {
    body.style.backgroundColor = background;
    body.style.color = (c.heading || c.text)?.trim() || "";
  }

  root.setAttribute("data-branded", "true");

  for (const key of STAGE_KEYS) {
    const stage = settings.stages[key];
    if (!stage) continue;
    const cssKey = key.replace(/_/g, "-");
    setVar(root, `--stage-${cssKey}-bg`, stage.bg);
    setVar(root, `--stage-${cssKey}-text`, stage.text);
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

function mixHex(a: string, b: string, ratio: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (!pa || !pb) return a;
  const mix = (x: number, y: number) => Math.round(x * (1 - ratio) + y * ratio);
  const out = (mix(pa.r, pb.r) << 16) | (mix(pa.g, pb.g) << 8) | mix(pa.b, pb.b);
  return `#${out.toString(16).padStart(6, "0")}`;
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
