import { DEFAULT_BRANDING } from "./defaults";
import type { BrandingSettings } from "./types";

let snapshot: BrandingSettings = { ...DEFAULT_BRANDING, labels: {}, placeholders: {}, stages: { ...DEFAULT_BRANDING.stages }, receipt: { ...DEFAULT_BRANDING.receipt } };

export function setBrandingSnapshot(settings: BrandingSettings) {
  snapshot = settings;
}

export function getBrandingSnapshot(): BrandingSettings {
  return snapshot;
}

export function brandingLabel(key: string, fallback: string): string {
  const v = snapshot.labels[key];
  return v?.trim() ? v : fallback;
}

export function brandingPlaceholder(key: string, fallback: string): string {
  const v = snapshot.placeholders[key];
  return v?.trim() ? v : fallback;
}

export function stageStyle(status: string): { backgroundColor?: string; color?: string } {
  const stage = snapshot.stages[status];
  if (!stage) return {};
  return { backgroundColor: stage.bg, color: stage.text };
}
