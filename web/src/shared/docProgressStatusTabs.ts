import { progressStatusLabel } from "./branding/progressStatus";

/** ECount list status pills: All / e-Approval / Unconfirmed / Confirm */
export const DOC_PROGRESS_STATUS_TABS = [
  { value: "", label: "All" },
  { value: "e_approval", label: progressStatusLabel("e_approval") },
  { value: "unconfirmed", label: progressStatusLabel("unconfirmed") },
  { value: "completed", label: "Confirm" },
] as const;

export function docProgressStatusLabel(status: string): string {
  if (status === "completed") return "Confirm";
  return progressStatusLabel(status);
}
