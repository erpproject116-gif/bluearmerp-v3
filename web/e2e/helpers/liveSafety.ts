import type { Page, Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type E2ETier = "read-only" | "reversible" | "posting";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Narrow allowlist: session/presence/draft endpoints that are not business mutations. */
const HARMLESS_MUTATION_PATH =
  /\/(auth\/|presence|drafts?|usage|notifications\/read|heartbeat|telemetry)/i;

export function currentTier(): E2ETier {
  const raw = (process.env.E2E_TIER || "read-only").toLowerCase();
  if (raw === "reversible" || raw === "posting") return raw;
  return "read-only";
}

export function mutationsAllowed(): boolean {
  const tier = currentTier();
  if (tier === "read-only") return false;
  if (process.env.E2E_ALLOW_MUTATIONS !== "1") return false;
  const confirm = process.env.E2E_RUN_CONFIRM?.trim();
  if (!confirm) return false;
  return true;
}

export function runId(): string {
  return (
    process.env.E2E_RUN_CONFIRM?.trim() ||
    process.env.E2E_RUN_ID?.trim() ||
    `E2E-${Date.now()}`
  );
}

export function isExternalBaseUrl(): boolean {
  const base = process.env.E2E_BASE_URL ?? "";
  return /^https?:\/\//i.test(base) && !/localhost|127\.0\.0\.1/i.test(base);
}

export function isLiveProductionUrl(): boolean {
  const base = process.env.E2E_BASE_URL ?? "";
  return /app\.bluearmerp\.com/i.test(base);
}

/**
 * Block business mutations unless the active tier explicitly allows them.
 * Unexpected mutation attempts are aborted and recorded; call assertNoBlockedMutations after the test body.
 */
const blockedMutations: string[] = [];

export function drainBlockedMutations(): string[] {
  const out = [...blockedMutations];
  blockedMutations.length = 0;
  return out;
}

export function assertNoBlockedMutations() {
  const blocked = drainBlockedMutations();
  if (blocked.length) {
    requestStop("unexpected-mutation");
    throw new Error(
      `Live safety: blocked unexpected mutations while tier=${currentTier()}:\n${blocked.slice(0, 5).join("\n")}`,
    );
  }
}

export async function installMutationGuard(page: Page): Promise<void> {
  const allow = mutationsAllowed();
  blockedMutations.length = 0;
  await page.route("**/api/**", async (route: Route) => {
    const req = route.request();
    const method = req.method().toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      await route.continue();
      return;
    }
    const url = req.url();
    if (HARMLESS_MUTATION_PATH.test(url)) {
      await route.continue();
      return;
    }
    if (allow) {
      await route.continue();
      return;
    }
    blockedMutations.push(`${method} ${url.replace(/^https?:\/\/[^/]+/, "")}`);
    await route.abort("blockedbyclient");
  });
}

export type StopReason =
  | "schema-unhealthy"
  | "rate-limit"
  | "auth-loss"
  | "unexpected-mutation"
  | "5xx-burst";

let stopFlag: StopReason | null = null;

export function requestStop(reason: StopReason) {
  stopFlag = reason;
}

export function consumeStop(): StopReason | null {
  const r = stopFlag;
  stopFlag = null;
  return r;
}

export function assertNotStopped() {
  if (stopFlag) {
    throw new Error(`E2E stop condition: ${stopFlag}`);
  }
}

/** Redact secrets from strings before writing evidence. */
export function redactSecrets(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [REDACTED]")
    .replace(/("(?:password|token|secret|authorization)"\s*:\s*")[^"]+"/gi, '$1[REDACTED]"')
    .replace(/(apikey|api_key|anon_key)=[^\s&]+/gi, "$1=[REDACTED]");
}

export function evidenceDir(): string {
  const dir = path.join(__dirname, "../.evidence", runId().replace(/[^\w.-]+/g, "_"));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeEvidence(name: string, body: string | object) {
  const file = path.join(evidenceDir(), name);
  const text = typeof body === "string" ? body : JSON.stringify(body, null, 2);
  fs.writeFileSync(file, redactSecrets(text), "utf8");
  return file;
}
