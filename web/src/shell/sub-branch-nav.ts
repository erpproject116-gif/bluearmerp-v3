import { ACCT_II_PREFIX, isAcctIIPath } from "./acct-ii-nav";
import { isReviewPurchasesPath, REVIEW_PURCHASES_SUB_BRANCH } from "./review-purchases-nav";
import type { ModuleFeature } from "./modules";

export function isSubBranchPath(pathname: string, prefix?: string): boolean {
  if (!prefix) return false;
  if (prefix === REVIEW_PURCHASES_SUB_BRANCH) return isReviewPurchasesPath(pathname);
  if (prefix === ACCT_II_PREFIX) return isAcctIIPath(pathname);
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
