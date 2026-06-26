import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch, getAccessToken } from "../api";
import {
  REPORT_TEMPLATE_API,
  reportTemplatesUrl,
  type ReportLogoAsset,
  type ReportTemplateKey,
  type SavedReportTemplate,
} from "./types";

export function useReportTemplates<TSettings = Record<string, unknown>>(reportKey: ReportTemplateKey) {
  return createQuery(() => ({
    queryKey: ["report-templates", reportKey],
    queryFn: async () => {
      const res = await apiFetch<SavedReportTemplate<TSettings>[]>(reportTemplatesUrl(reportKey));
      if (!res.success) throw new Error(res.message ?? "Failed to load templates");
      return res.data ?? [];
    },
    staleTime: 30_000,
  }));
}

export function useInvalidateReportTemplates(reportKey: ReportTemplateKey) {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["report-templates", reportKey] });
}

export async function saveReportTemplate<TSettings>(
  reportKey: ReportTemplateKey,
  input: { template_code?: string; template_name: string; settings: TSettings },
) {
  const res = await apiFetch<{ id: number; template_code: string }>(reportTemplatesUrl(reportKey), {
    method: "PUT",
    body: JSON.stringify(input),
  });
  if (!res.success) throw new Error(res.message ?? "Failed to save template");
  return res.data!;
}

export async function deleteReportTemplate(reportKey: ReportTemplateKey, templateCode: string) {
  const res = await apiFetch(
    `${REPORT_TEMPLATE_API}/${encodeURIComponent(templateCode)}?report_key=${encodeURIComponent(reportKey)}`,
    { method: "DELETE" },
  );
  if (!res.success) throw new Error(res.message ?? "Failed to delete template");
}

export async function uploadReportLogo(reportKey: ReportTemplateKey, file: File): Promise<ReportLogoAsset> {
  const form = new FormData();
  form.append("file", file);
  const token = await getAccessToken();
  const res = await fetch(`${REPORT_TEMPLATE_API}/logo?report_key=${encodeURIComponent(reportKey)}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.message ?? "Failed to upload logo");
  return json.data as ReportLogoAsset;
}

export async function deleteReportLogo(assetId: number) {
  const res = await apiFetch(`${REPORT_TEMPLATE_API}/logo/${assetId}`, { method: "DELETE" });
  if (!res.success) throw new Error(res.message ?? "Failed to delete logo");
}

export async function fetchReportLogoBlob(assetId: number): Promise<string> {
  const token = await getAccessToken();
  const res = await fetch(`${REPORT_TEMPLATE_API}/logo/${assetId}/download?inline=1`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Failed to load logo");
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
