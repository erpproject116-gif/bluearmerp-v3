import { progressStatusLabel } from "./branding/progressStatus";

/** Human label for document status codes shown in Load Slip pickers. */
export function openSlipDocStatusLabel(status: string | null | undefined): string {
  const s = String(status ?? "")
    .trim()
    .toLowerCase();
  if (!s) return "—";
  switch (s) {
    case "draft":
      return "Draft";
    case "confirmed":
      return "Confirmed";
    case "partially_received":
      return "Partially received";
    case "received":
      return "Received";
    case "accepted":
      return "Accepted";
    case "rejected":
      return "Rejected";
    case "cancelled":
      return "Cancelled";
    case "sent":
      return "Sent";
    case "closed":
      return "Closed";
    case "unconfirmed":
    case "e_approval":
    case "in_progress":
    case "completed":
      return progressStatusLabel(s);
    default:
      return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

/** SO Load Slip: progress label plus delivery hint when residual is undelivered. */
export function openSlipSalesOrderStatusLabel(
  progressStatus: string | null | undefined,
  deliveredQty?: number | null,
): string {
  const base = openSlipDocStatusLabel(progressStatus);
  if (deliveredQty == null) return base;
  if (Number(deliveredQty) > 0.0001) return `${base} · Delivered`;
  return `${base} · No DR`;
}
