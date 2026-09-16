/**
 * Prerequisite failure helpers — never silent skip that looks like coverage.
 */
export function annotateBlocked(
  testInfo: { annotations: { type: string; description?: string }[] },
  type: "needs-seed" | "role-gated" | "environment-blocked" | "incomplete-create",
  reason: string,
): never {
  testInfo.annotations.push({ type, description: reason });
  throw new Error(`QA blocked (${type}): ${reason}`);
}
