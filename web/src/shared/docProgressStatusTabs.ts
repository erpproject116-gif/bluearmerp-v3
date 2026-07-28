import { progressStatusLabel } from "./branding/progressStatus";

/** List status pills aligned to Ecount Inv.I lists: All / e-Approval / Unconfirmed / In Progress / Completed */
export const DOC_PROGRESS_STATUS_TABS = [
  { value: "", label: "All" },
  { value: "e_approval", label: progressStatusLabel("e_approval") },
  { value: "unconfirmed", label: progressStatusLabel("unconfirmed") },
  { value: "in_progress", label: progressStatusLabel("in_progress") },
  { value: "completed", label: progressStatusLabel("completed") },
] as const;

export function docProgressStatusLabel(status: string): string {
  return progressStatusLabel(status);
}
