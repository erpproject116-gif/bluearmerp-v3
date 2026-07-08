import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type ProcessPolicy = {
  tenant_id: number;
  sales_require_quotation: boolean;
  sales_require_so: boolean;
  sales_require_reservation: boolean;
  sales_require_delivery_receipt: boolean;
  purchase_require_pr: boolean;
  purchase_require_pr_approval: boolean;
  purchase_require_gr_before_supplier_invoice: boolean;
  legacy_combined_so_release: boolean;
  sales_enforce_credit_limit: boolean;
  accounts_auto_post_or: boolean;
  accounts_auto_post_pv: boolean;
  accounts_auto_post_sales: boolean;
  accounts_auto_post_purchase: boolean;
  sales_require_so_approval: boolean;
  purchase_require_po_approval: boolean;
  finance_require_je_approval: boolean;
  budget_control_mode: string;
  quotation_require_attachment: boolean;
  sales_order_require_attachment: boolean;
  sales_require_attachment: boolean;
  purchase_order_require_attachment: boolean;
  supplier_invoice_require_attachment: boolean;
};

export type AttachmentDocKind =
  | "quotation"
  | "sales_order"
  | "sales"
  | "purchase_order"
  | "supplier_invoice";

export function isConfirmingProgress(kind: AttachmentDocKind, status: string): boolean {
  const s = status.trim();
  switch (kind) {
    case "quotation":
    case "sales_order":
      return s === "in_progress" || s === "completed";
    case "sales":
      return s === "completed" || s === "e_approval";
    case "supplier_invoice":
      return s === "completed" || s === "e_approval";
    default:
      return false;
  }
}

export function policyRequiresAttachment(
  policy: ProcessPolicy | undefined,
  kind: AttachmentDocKind,
): boolean {
  if (!policy) return true;
  switch (kind) {
    case "quotation":
      return policy.quotation_require_attachment !== false;
    case "sales_order":
      return policy.sales_order_require_attachment !== false;
    case "sales":
      return policy.sales_require_attachment !== false;
    case "purchase_order":
      return policy.purchase_order_require_attachment !== false;
    case "supplier_invoice":
      return policy.supplier_invoice_require_attachment !== false;
    default:
      return false;
  }
}

export const attachmentRequiredMessage =
  "At least one attachment is required before confirming. Save as Unconfirmed, upload a file, then confirm.";

export function validateAttachmentBeforeConfirm(
  policy: ProcessPolicy | undefined,
  kind: AttachmentDocKind,
  progressStatus: string,
  attachmentCount: number,
  docId?: number,
): string | null {
  if (!policyRequiresAttachment(policy, kind) || !isConfirmingProgress(kind, progressStatus)) {
    return null;
  }
  if (!docId || attachmentCount < 1) {
    return attachmentRequiredMessage;
  }
  return null;
}

export function useProcessPolicy(enabled: () => boolean = () => true) {
  return createQuery(() => ({
    queryKey: ["process-policy"],
    enabled: enabled(),
    queryFn: async () => {
      const res = await apiFetch<{ policy: ProcessPolicy; can_manage: boolean }>(
        "/api/v1/settings/process-policies",
      );
      if (!res.success) throw new Error(res.message ?? "Failed to load process policies");
      return res.data?.policy;
    },
    staleTime: 60_000,
  }));
}
