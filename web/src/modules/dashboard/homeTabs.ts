export type HomeTabId = "dashboard" | "onboarding" | "recent-updates";

export const HOME_TABS: { id: HomeTabId; label: string; href: string }[] = [
  { id: "dashboard", label: "Dashboard", href: "/app/dashboard" },
  { id: "onboarding", label: "Onboarding", href: "/app/dashboard/onboarding" },
  { id: "recent-updates", label: "Recent updates", href: "/app/dashboard/recent-updates" },
];

export function resolveHomeTab(pathname: string): HomeTabId {
  if (pathname.startsWith("/app/dashboard/onboarding") || pathname.startsWith("/app/dashboard/getting-started")) {
    return "onboarding";
  }
  if (pathname.startsWith("/app/dashboard/recent-updates")) return "recent-updates";
  return "dashboard";
}

export function isHomeTabPath(pathname: string): boolean {
  const tab = resolveHomeTab(pathname);
  if (tab !== "dashboard") return true;
  return pathname === "/app/dashboard" || pathname === "/app/dashboard/";
}

export const HOME_ONBOARDING_HREF = "/app/dashboard/onboarding";
