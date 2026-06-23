import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type QuotationPipelineStage = "open" | "expired" | "converted_so" | "converted_sales" | "won";

export type QuotationPipelineCard = {
  id: number;
  order_date: string;
  date_no_display: string;
  reference_no: string;
  customer_name: string;
  partner_id: number;
  pic_name?: string;
  grand_total: number;
  valid_until?: string | null;
  progress_status: string;
  pipeline_stage: QuotationPipelineStage;
  voucher_status?: string;
  item_name_summary?: string;
};

export type QuotationPipelineData = {
  stages: Partial<Record<QuotationPipelineStage, QuotationPipelineCard[]>>;
};

const EMPTY_STAGES: QuotationPipelineData["stages"] = {
  open: [],
  expired: [],
  converted_so: [],
  converted_sales: [],
  won: [],
};

export function useQuotationPipeline(enabled = true) {
  return createQuery(() => ({
    queryKey: ["crm-quotation-pipeline"],
    enabled,
    queryFn: async () => {
      const res = await apiFetch<QuotationPipelineData>("/api/v1/crm/pipelines/quotations");
      if (!res.success) throw new Error(res.message ?? "Failed to load quotation pipeline");
      return res.data ?? { stages: EMPTY_STAGES };
    },
    staleTime: 30_000,
  }));
}

export function useInvalidateQuotationPipeline() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["crm-quotation-pipeline"] });
}

export const PIPELINE_STAGE_LABELS: Record<QuotationPipelineStage, string> = {
  open: "Open",
  expired: "Expired",
  converted_so: "Converted to SO",
  converted_sales: "Converted to Sales",
  won: "Won",
};

export const PIPELINE_STAGE_ORDER: QuotationPipelineStage[] = [
  "open",
  "expired",
  "converted_so",
  "converted_sales",
  "won",
];
