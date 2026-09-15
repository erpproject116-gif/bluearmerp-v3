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
  inventory_gl_hybrid_enabled?: boolean;
  inventory_require_serial_adjustment_approval?: boolean;
  inventory_require_stock_adjustment_approval?: boolean;
  ar_payment_discount_account_id?: number | null;
  ap_payment_discount_account_id?: number | null;
  budget_control_mode: string;
  quotation_require_attachment: boolean;
  sales_order_require_attachment: boolean;
  sales_require_attachment: boolean;
  purchase_order_require_attachment: boolean;
  supplier_invoice_require_attachment: boolean;
  manufacturing_require_fg_qc?: boolean;
  sales_count_completed_wo_toward_release?: boolean;
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
    case "purchase_order":
      return s !== "" && s !== "draft" && s !== "unconfirmed";
    default:
      return false;
  }
}

export function policyRequiresAttachment(
  policy: ProcessPolicy | undefined,
  kind: AttachmentDocKind,
): boolean {
  // Until policy loads, do not block confirm (settings page is source of truth).
  if (!policy) return false;
  switch (kind) {
    case "quotation":
      return Boolean(policy.quotation_require_attachment);
    case "sales_order":
      return Boolean(policy.sales_order_require_attachment);
    case "sales":
      return Boolean(policy.sales_require_attachment);
    case "purchase_order":
      return Boolean(policy.purchase_order_require_attachment);
    case "supplier_invoice":
      return Boolean(policy.supplier_invoice_require_attachment);
    default:
      return false;
  }
}

export const attachmentRequiredMessage =
  "At least one attachment is required before confirming. Add a file in Attachments, then save — or turn off “Require file” under Form settings / Setup.";

/** Where to adjust attachment requirement for each document kind. */
export function attachmentSettingsHref(kind: AttachmentDocKind): string {
  switch (kind) {
    case "quotation":
      return "/app/quotation/quotations/settings";
    case "sales_order":
      return "/app/sales-order/sales-orders/settings";
    case "sales":
      return "/app/sales/sales/settings";
    case "purchase_order":
      return "/app/purchase-order/purchase-orders/settings";
    case "supplier_invoice":
      return "/app/purchases/purchase-receive/settings";
    default:
      return "/app/user-management/process-policies";
  }
}

/** Client-side gate toast with a link to Form settings (attachment toggles). */
export function toastAttachmentRequired(
  toast: {
    warning: (message: string) => void;
    action?: (input: {
      type?: "success" | "error" | "warning";
      title: string;
      message?: string;
      actionLabel?: string;
      href?: string;
    }) => void;
  },
  kind: AttachmentDocKind,
  message = attachmentRequiredMessage,
) {
  if (toast.action) {
    toast.action({
      type: "warning",
      title: message,
      message: "Upload a file on this document, or turn off “Require file” in Form settings.",
      actionLabel: "Open Form settings",
      href: attachmentSettingsHref(kind),
    });
    return;
  }
  toast.warning(message);
}

export function validateAttachmentBeforeConfirm(
  policy: ProcessPolicy | undefined,
  kind: AttachmentDocKind,
  progressStatus: string,
  attachmentCount: number,
  _docId?: number,
): string | null {
  if (!policyRequiresAttachment(policy, kind) || !isConfirmingProgress(kind, progressStatus)) {
    return null;
  }
  if (attachmentCount < 1) {
    return attachmentRequiredMessage;
  }
  return null;
}

export function useProcessPolicy(enabled: () => boolean = () => true) {
  return createQuery(() => ({
    queryKey: ["process-policy"],
    enabled: enabled(),
    queryFn: async () => {
      const res = await apiFetch<{
        policy: ProcessPolicy;
        can_manage: boolean;
        module_enabled?: boolean;
      }>("/api/v1/settings/process-policies");
      if (!res.success) throw new Error(res.message ?? "Failed to load process policies");
      const policy = res.data?.policy;
      if (!policy) return undefined;
      // Module off → treat as all attachment/flow gates inactive for client-side checks.
      if (res.data?.module_enabled === false) {
        return {
          ...policy,
          sales_require_quotation: false,
          sales_require_so: false,
          sales_require_reservation: false,
          sales_require_delivery_receipt: false,
          purchase_require_pr: false,
          purchase_require_pr_approval: false,
          purchase_require_gr_before_supplier_invoice: false,
          sales_enforce_credit_limit: false,
          sales_require_so_approval: false,
          purchase_require_po_approval: false,
          finance_require_je_approval: false,
          inventory_gl_hybrid_enabled: false,
          inventory_require_serial_adjustment_approval: false,
          inventory_require_stock_adjustment_approval: true,
          budget_control_mode: "off",
          quotation_require_attachment: false,
          sales_order_require_attachment: false,
          sales_require_attachment: false,
          purchase_order_require_attachment: false,
          supplier_invoice_require_attachment: false,
          manufacturing_require_fg_qc: false,
        };
      }
      return policy;
    },
    staleTime: 60_000,
  }));
}
