import { apiFetch } from "../../shared/api";

type Client = { name: string; sites?: { id: number; site_name: string }[] };

export type SiteChoice = { id: number; site_name: string; client_name: string };

export async function siteChoices(): Promise<SiteChoice[]> {
  const res = await apiFetch<Client[]>("/api/v1/hr/clients");
  return (res.data ?? []).flatMap((client) =>
    (client.sites ?? []).map((site) => ({ id: site.id, site_name: site.site_name, client_name: client.name })),
  );
}
