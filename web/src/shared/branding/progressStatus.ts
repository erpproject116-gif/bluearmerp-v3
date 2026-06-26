import { brandingLabel } from "./brandingStore";

export const PROGRESS_STATUS_GROUPS = [
  {
    label: "Unconfirmed",
    options: [{ value: "unconfirmed", label: "Unconfirmed" }],
  },
  {
    label: "Confirm",
    options: [
      { value: "in_progress", label: "In progress" },
      { value: "completed", label: "Completed" },
    ],
  },
] as const;

const FALLBACK_LABELS: Record<string, string> = {
  unconfirmed: "Unconfirmed",
  completed: "Completed",
  in_progress: "In progress",
  received: "Received",
  finished: "Finished",
  partial: "Partial",
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
