import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runId, redactSecrets } from "./liveSafety";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type LedgerEntry = {
  at: string;
  runId: string;
  kind: string;
  marker: string;
  path?: string;
  detail?: string;
  status: "created" | "updated" | "posted" | "reversed" | "abandoned";
};

function ledgerPath(): string {
  const dir = path.join(__dirname, "../.evidence", runId().replace(/[^\w.-]+/g, "_"));
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "mutation-ledger.jsonl");
}

export function ledgerAppend(entry: Omit<LedgerEntry, "at" | "runId">) {
  const row: LedgerEntry = {
    at: new Date().toISOString(),
    runId: runId(),
    ...entry,
  };
  fs.appendFileSync(ledgerPath(), redactSecrets(JSON.stringify(row)) + "\n", "utf8");
}

export function e2eMarker(prefix = "E2E"): string {
  return `${prefix}-${runId().replace(/^E2E-?/i, "")}`.slice(0, 80);
}

export function readLedger(): LedgerEntry[] {
  const file = ledgerPath();
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LedgerEntry);
}
