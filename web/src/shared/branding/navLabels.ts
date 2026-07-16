import { brandingLabel } from "./brandingStore";
import type { AppModule, ModuleFeature } from "../../shell/modules";

export function navModuleLabelKey(moduleId: string): string {
  return `nav.module.${moduleId}`;
}

/** Stable key from feature href (path segments after /app). */
export function navFeatureStableKey(href: string): string {
  const path = href.replace(/^\/app\/?/, "").replace(/\/+$/, "");
  return path.replace(/\//g, "_") || "root";
}

export function navFeatureLabelKey(moduleId: string, href: string): string {
  return `nav.feature.${moduleId}.${navFeatureStableKey(href)}`;
}

export function resolveNavModuleLabel(moduleId: string, fallback: string): string {
  return brandingLabel(navModuleLabelKey(moduleId), fallback);
}

export function resolveNavFeatureLabel(moduleId: string, feature: ModuleFeature): string {
  return brandingLabel(navFeatureLabelKey(moduleId, feature.href), feature.label);
}

export type NavLabelRow = {
  key: string;
  scope: "module" | "feature";
  moduleId: string;
  defaultLabel: string;
  groupTitle: string;
};

/** Flatten appModules into Branding editor rows. */
export function buildNavLabelCatalog(modules: AppModule[]): NavLabelRow[] {
  const rows: NavLabelRow[] = [];
  for (const mod of modules) {
    rows.push({
      key: navModuleLabelKey(mod.id),
      scope: "module",
      moduleId: mod.id,
      defaultLabel: mod.label,
      groupTitle: mod.label,
    });
    for (const feature of mod.features) {
      rows.push({
        key: navFeatureLabelKey(mod.id, feature.href),
        scope: "feature",
        moduleId: mod.id,
        defaultLabel: feature.label,
        groupTitle: mod.label,
      });
    }
    for (const branch of mod.subBranches ?? []) {
      rows.push({
        key: navFeatureLabelKey(mod.id, branch.href),
        scope: "feature",
        moduleId: mod.id,
        defaultLabel: branch.label,
        groupTitle: `${mod.label} · sub-branch`,
      });
    }
  }
  return rows;
}
