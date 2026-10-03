import { apiFetch } from "./api";
import { clearRolePreviewAttempt, clearRolePreviewFlag } from "./rolePreviewClient";

/** Idempotent escape hatch — clear server preview columns + client flags. */
export async function endRolePreviewSession(): Promise<void> {
  try {
    await apiFetch("/api/v1/auth/role-preview/end", { method: "POST", body: "{}" }, { silent: true });
  } catch {
    /* still clear local flags */
  }
  clearRolePreviewFlag();
  clearRolePreviewAttempt();
}
