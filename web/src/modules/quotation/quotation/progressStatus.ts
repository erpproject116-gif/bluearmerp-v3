export const PROGRESS_STATUS_GROUPS = [
  {
    label: "Unconfirmed",
    options: [{ value: "unconfirmed", label: "Unconfirmed" }],
  },
  {
    label: "Confirm",
    options: [
      { value: "in_progress", label: "In Progress" },
      { value: "completed", label: "Completed" },
    ],
  },
] as const;

export function progressStatusLabel(status: string): string {
  for (const group of PROGRESS_STATUS_GROUPS) {
    const match = group.options.find((o) => o.value === status);
    if (match) return match.label;
  }
  return status;
}

export function voucherStatusLabel(status?: string | null): string {
  switch (status) {
    case "partial":
      return "Partial";
    case "completed":
      return "Completed";
    default:
      return "None";
  }
}
