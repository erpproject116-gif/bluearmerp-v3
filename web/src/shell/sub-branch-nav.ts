import type { ModuleFeature } from "./modules";

export function isSubBranchPath(pathname: string, prefix?: string): boolean {
  if (!prefix) return false;
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isAnySubBranchPath(
  pathname: string,
  subBranches?: ModuleFeature[],
): boolean {
  return subBranches?.some((b) => isSubBranchPath(pathname, b.prefix)) ?? false;
}

export function resolveSubBranchByPath(
  pathname: string,
  subBranches?: ModuleFeature[],
): ModuleFeature | undefined {
  return subBranches?.find(
    (b) =>
      b.prefix &&
      (pathname === b.href ||
        pathname === b.settingsHref ||
        isSubBranchPath(pathname, b.prefix)),
  );
}
