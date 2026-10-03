import { apiFetch } from "./api";
import { clearRolePreviewAttempt, clearRolePreviewFlag } from "./rolePreviewClient";

/** Idempotent escape hatch — clear server preview columns + client flags. */
export async function endRolePreviewSession(): Promise<boolean> {
  let serverCleared = false;
  try {
    const res = await apiFetch(
      "/api/v1/auth/role-preview/end",
      { method: "POST", body: "{}" },
      { silent: true },
    );
    serverCleared = res.success;
  } catch {
    /* still clear local flags */
  }
  clearRolePreviewFlag();
  clearRolePreviewAttempt();
  return serverCleared;
}
