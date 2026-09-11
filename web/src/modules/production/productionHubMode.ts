import type { MfgMode } from "./mfgProductionMode";
import { modeFromPath, parseMfgMode } from "./mfgProductionMode";

const STORAGE_KEY = "bluearm.production.lastMode";

/** Infer assembly vs disassembly from any production route (including floor stations). */
export function inferMfgModeFromPath(pathname: string, search = ""): MfgMode | null {
  const fromSegment = modeFromPath(pathname);
  if (fromSegment) return fromSegment;

  const path = pathname.toLowerCase();
  if (path.startsWith("/app/production/weigh-parts")) return "disassembly";

  const params = new URLSearchParams(search);
  if (path.startsWith("/app/production/receive-station")) {
    return params.get("mode") === "disassembly" ? "disassembly" : "assembly";
  }
  if (path.startsWith("/app/production/issue-station")) {
    return params.get("mode") === "disassembly" ? "disassembly" : "assembly";
  }

  return null;
}

export function readLastMfgMode(): MfgMode {
  try {
    const stored = parseMfgMode(localStorage.getItem(STORAGE_KEY) ?? undefined);
    if (stored) return stored;
  } catch {
    /* private mode / SSR */
  }
  return "assembly";
}

export function persistLastMfgMode(mode: MfgMode): void {
  try {
    const store = mode === "all" ? "assembly" : mode;
    localStorage.setItem(STORAGE_KEY, store);
  } catch {
    /* ignore */
  }
}

export function trackProductionPath(pathname: string, search = ""): void {
  const mode = inferMfgModeFromPath(pathname, search);
  if (mode) persistLastMfgMode(mode);
}
