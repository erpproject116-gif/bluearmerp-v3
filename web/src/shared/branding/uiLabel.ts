import { brandingLabel } from "./brandingStore";
import { uiCopyFallback } from "./uiCopyCatalog";

/** Resolve tenant-overridden UI copy; falls back to catalog default or the key itself. */
export function uiLabel(key: string, fallback?: string): string {
  return brandingLabel(key, fallback ?? uiCopyFallback(key) ?? key);
}
