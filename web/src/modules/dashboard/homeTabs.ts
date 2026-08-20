export type HomeTabId = "dashboard" | "getting-started" | "recent-updates";

export const HOME_TABS: { id: HomeTabId; label: string; href: string }[] = [
  { id: "dashboard", label: "Dashboard", href: "/app/dashboard" },
  { id: "getting-started", label: "Getting started", href: "/app/dashboard/getting-started" },
  { id: "recent-updates", label: "Recent updates", href: "/app/dashboard/recent-updates" },
];

export function resolveHomeTab(pathname: string): HomeTabId {
  if (pathname.startsWith("/app/dashboard/getting-started")) return "getting-started";
  if (pathname.startsWith("/app/dashboard/recent-updates")) return "recent-updates";
  return "dashboard";
}

export function isHomeTabPath(pathname: string): boolean {
  const tab = resolveHomeTab(pathname);
  if (tab !== "dashboard") return true;
  return pathname === "/app/dashboard" || pathname === "/app/dashboard/";
}
