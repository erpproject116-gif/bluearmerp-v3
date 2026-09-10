import { getGlobalToast } from "../../shared/toast";

/** Map technical API / legacy strings to everyday next-step language. */
export function friendlyMfgMessage(raw: string | undefined | null, fallback: string): string {
  const msg = (raw ?? "").trim();
  if (!msg) return fallback;
  const lower = msg.toLowerCase();

  if (lower.includes("work order not found") || lower.includes("job not found")) {
    return "This job isn’t available. Go back to Jobs and open it again.";
  }
  if (lower.includes("fg inspection") || lower.includes("pass fg") || lower.includes("inspection_status")) {
    return "Quality check still open — mark it Passed, then Finish.";
  }
  if (lower.includes("must pass") && lower.includes("inspection")) {
    return "Quality check still open — mark it Passed, then Finish.";
  }
  if (lower.includes("insufficient") || lower.includes("shortage") || lower.includes("not enough")) {
    return "Not enough stock at this location. Add stock or lower the job qty.";
  }
  if (lower.includes("released work order") || (lower.includes("not released") && lower.includes("work"))) {
    return "Start the job first, then try this step again.";
  }
  if (lower.includes("active bom not found") || lower.includes("bom not found")) {
    return "That recipe isn’t available. Pick another recipe and try again.";
  }
  if (lower.includes("production location is required") || lower.includes("location is required")) {
    return "Choose a location for this job, then save.";
  }
  if (lower.includes("quantity must be greater") || lower.includes("qty must")) {
    return "Enter a quantity greater than zero.";
  }
  if (lower.includes("catch-weight") || lower.includes("positive")) {
    return "Enter how many you got (must be more than 0).";
  }
  if (lower.includes("cut-apart") || (lower.includes("disassembly") && lower.includes("weigh"))) {
    return "Record parts is only for take-apart jobs. Use Record finished for build jobs.";
  }
  if (lower.includes("failed to load work order") || lower.includes("failed to load bom") || lower.includes("failed to load recipe")) {
    return "Couldn’t load this job. Go back to Jobs and open it again.";
  }
  if (lower.includes("failed to") && lower.includes("complete")) {
    return "Couldn’t finish this job. Check stock, then try again.";
  }
  if (lower.includes("failed to") && (lower.includes("issue") || lower.includes("stage"))) {
    return "Couldn’t take that from stock. Check the serial/lot and try again.";
  }

  return msg;
}

export function mfgSuccess(message: string) {
  getGlobalToast()?.success(message);
}

export function mfgWarn(raw: string | undefined | null, fallback: string) {
  getGlobalToast()?.warning(friendlyMfgMessage(raw, fallback));
}

export function mfgError(raw: string | undefined | null, fallback: string) {
  getGlobalToast()?.error(friendlyMfgMessage(raw, fallback));
}
