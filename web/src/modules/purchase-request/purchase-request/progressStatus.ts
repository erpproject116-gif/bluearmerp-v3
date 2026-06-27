import { brandingLabel } from "../../../shared/branding/brandingStore";

export const PROGRESS_STATUS_GROUPS = [
  {
    label: "Unconfirmed",
    options: [{ value: "unconfirmed", label: "Unconfirmed" }],
  },
  {
    label: "E-Approval",
    options: [{ value: "e_approval", label: "E-Approval" }],
  },
  {
    label: "Confirmed",
    options: [{ value: "confirmed", label: "Confirmed" }],
  },
  {
    label: "In Progress",
    options: [{ value: "in_progress", label: "In Progress" }],
  },
  {
    label: "Completed",
    options: [{ value: "completed", label: "Completed" }],
  },
] as const;

const FALLBACK_LABELS: Record<string, string> = {
  unconfirmed: "Unconfirmed",
  e_approval: "E-Approval",
  confirmed: "Confirmed",
  in_progress: "In Progress",
  completed: "Completed",
};

export function progressStatusLabel(status: string): string {
  const fallback = FALLBACK_LABELS[status] ?? status.replaceAll("_", " ");
  return brandingLabel(`progress.${status}`, fallback);
}

export function progressStatusGroups() {
  return PROGRESS_STATUS_GROUPS.map((group) => ({
    ...group,
    options: group.options.map((opt) => ({
      ...opt,
      label: progressStatusLabel(opt.value),
    })),
  }));
}
