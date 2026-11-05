import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";

const agencyPrefixes = [
  "/app/hr/clients",
  "/app/hr/contracts",
  "/app/hr/manpower-requests",
  "/app/hr/deployments",
  "/app/hr/workforce",
  "/app/hr/attendance/client-dtr",
  "/app/hr/client-billing",
  "/app/hr/offboarding",
  "/app/hr/compliance",
  "/app/hr/government-reports",
];

export function isAgencyPath(pathname: string): boolean {
  return agencyPrefixes.some((href) => pathname === href || pathname.startsWith(`${href}/`));
}

export function useManpowerMode() {
  const qc = useQueryClient();
  const query = createQuery(() => ({
    queryKey: ["hr-manpower-mode"],
    queryFn: async () => {
      const res = await apiFetch<{ manpower_mode: boolean }>("/api/v1/hr/manpower-mode");
      if (!res.success || res.data == null) return true;
      return res.data.manpower_mode;
    },
  }));
  return {
    loading: () => query.isPending,
    enabled: () => query.data !== false,
    save: async (on: boolean) => {
      const res = await apiFetch("/api/v1/hr/manpower-mode", {
        method: "PATCH",
        body: JSON.stringify({ manpower_mode: on }),
      });
      if (!res.success) return res;
      await qc.invalidateQueries({ queryKey: ["hr-manpower-mode"] });
      return res;
    },
  };
}
