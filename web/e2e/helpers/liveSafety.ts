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

/**
 * Records created during this run, keyed as "<resource>/<id>". Only these may be
 * updated or deleted by a mutating run; everything else is pre-existing tenant data.
 */
const runOwnedRecords = new Set<string>();
const markerViolations: string[] = [];

export function runOwned(): string[] {
  return [...runOwnedRecords];
}

export function assertNoMarkerViolations() {
  if (markerViolations.length) {
    requestStop("unexpected-mutation");
    throw new Error(
      `Live safety: mutation targeted a record that is not owned by this run:\n${markerViolations
        .slice(0, 5)
        .join("\n")}`,
    );
  }
}

function resourceOf(url: string): string {
  const pathOnly = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
  return pathOnly.replace(/\/\d+$/, "");
}

function recordKey(url: string): string | null {
  const pathOnly = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
  const id = /\/(\d+)$/.exec(pathOnly)?.[1];
  return id ? `${resourceOf(url)}/${id}` : null;
}

export async function installMutationGuard(page: Page): Promise<void> {
  const allow = mutationsAllowed();
  const marker = runId();
  blockedMutations.length = 0;
  markerViolations.length = 0;
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
    if (!allow) {
      blockedMutations.push(`${method} ${url.replace(/^https?:\/\/[^/]+/, "")}`);
      await route.abort("blockedbyclient");
      return;
    }

    const body = req.postData() ?? "";
    const target = recordKey(url);
    const carriesMarker = body.includes(marker) || body.includes(marker.replace(/^E2E-?/i, ""));

    if (method === "POST" && !target) {
      // Creating something new: it must be identifiable as ours or we cannot reverse it.
      if (!carriesMarker) {
        markerViolations.push(
          `${method} ${url.replace(/^https?:\/\/[^/]+/, "")} has no "${marker}" marker in its payload`,
        );
        await route.abort("blockedbyclient");
        return;
      }
    } else if (target && !runOwnedRecords.has(target) && !carriesMarker) {
      // Editing or deleting something this run did not create.
      markerViolations.push(`${method} ${target} was not created by run ${marker}`);
      await route.abort("blockedbyclient");
      return;
    }

    const response = await route.fetch();
    if (method === "POST" && response.ok()) {
      const created = await response.json().catch(() => null);
      const id = created?.data?.id ?? created?.id;
      if (typeof id === "number" || typeof id === "string") {
        runOwnedRecords.add(`${resourceOf(url)}/${id}`);
      }
    }
    await route.fulfill({ response });
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
