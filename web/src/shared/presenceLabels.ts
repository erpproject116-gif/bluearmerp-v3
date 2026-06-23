import { TAX_MNGT_PREFIX, featureHeaderTitle, resolveFeature, resolveModule, resolveSubBranch } from "../shell/modules";
import { taxMngtHeaderTitle } from "../shell/tax-mngt-nav";

/** Human-readable screen label for a route path (used in presence heartbeats). */
export function describePresencePath(pathname: string): string {
  if (pathname === "/app" || pathname === "/app/") return "Dashboard";

  const mod = resolveModule(pathname);
  if (!mod) return "App";

  const sub = resolveSubBranch(mod, pathname);
  if (sub) {
    if (sub.prefix === TAX_MNGT_PREFIX) return taxMngtHeaderTitle(pathname);
    return sub.label;
  }

  const feat = resolveFeature(mod, pathname);
  if (feat) return featureHeaderTitle(feat, pathname);

  return mod.label;
}

export function presenceActivityLabel(activity: string): string {
  if (activity === "editing") return "Editing";
  return "Viewing";
}
