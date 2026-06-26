export {
  PROGRESS_STATUS_GROUPS,
  progressStatusLabel,
  progressStatusGroups,
} from "../../../shared/branding/progressStatus";

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
