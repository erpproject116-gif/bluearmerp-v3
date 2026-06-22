export const PROGRESS_STATUS_GROUPS = [
  {
    label: "Unconfirmed",
    options: [{ value: "unconfirmed", label: "Unconfirmed" }],
  },
  {
    label: "Confirm",
    options: [{ value: "completed", label: "Completed" }],
  },
] as const;

export function progressStatusLabel(status: string): string {
  for (const group of PROGRESS_STATUS_GROUPS) {
    const match = group.options.find((o) => o.value === status);
    if (match) return match.label;
  }
  return status;
}
