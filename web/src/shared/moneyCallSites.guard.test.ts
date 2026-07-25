import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression guard: money display must go through shared/money.ts helpers.
 * No ESLint in this repo — this vitest walk replaces a lint rule.
 *
 * Allowlist paths that intentionally format non-money values, or are the helpers themselves.
 */

const WEB_SRC = join(__dirname, "..");
const ROOT = join(WEB_SRC, "modules");
const SHARED = join(WEB_SRC, "shared");

const ALLOW_PATH_SUBSTRINGS = [
  "shared/money.ts",
  "shared/money.test.ts",
  "shared/MoneyCell.tsx",
  "shared/moneyCallSites.guard.test.ts",
  // qty / non-money decimals
  "sanitizeQtyInput",
];

const ALLOW_FILE_BASENAMES = new Set([
  "money.ts",
  "money.test.ts",
  "MoneyCell.tsx",
  "moneyCallSites.guard.test.ts",
]);

/** Paths allowed to keep local formatting (documented exceptions). */
const ALLOW_RELATIVE_FILES = new Set<string>([
  // POS payment split uses toFixed(2) for input/state string amounts, not table display.
  "modules/pos/PosPage.tsx",
]);

const MONEY_IDENT =
  /\b(?:amount|debit|credit|balance|total|price|grand_total|unit_price|sales_price|total_amount|line_total|freight|withheld|net_payment|price_delta|total_debit|total_credit)\b/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(name) && !name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

function toRel(abs: string): string {
  return relative(WEB_SRC, abs).replace(/\\/g, "/");
}

function isAllowed(rel: string): boolean {
  if (ALLOW_FILE_BASENAMES.has(rel.split("/").pop() ?? "")) return true;
  if (ALLOW_RELATIVE_FILES.has(rel)) return true;
  return ALLOW_PATH_SUBSTRINGS.some((s) => rel.includes(s));
}

type Hit = { file: string; line: number; text: string; reason: string };

function scanFile(abs: string): Hit[] {
  const rel = toRel(abs);
  if (isAllowed(rel)) return [];
  const hits: Hit[] = [];
  const lines = readFileSync(abs, "utf8").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
    // Explicit opt-out for a line
    if (line.includes("money-guard-allow")) continue;

    if (/\\u20B1|₱/.test(line) && !line.includes("PESO") && !line.includes("from")) {
      // Label copy like "Monthly ₱" in settings is ok if not formatting a number
      if (!/\d|format|toFixed|toLocaleString|\$\{/.test(line) && /Monthly|Fixed amount|label/i.test(line)) {
        continue;
      }
      if (/\\u20B1|₱/.test(line) && /["'`]/.test(line) && !MONEY_IDENT.test(line) && !/formatMoney|formatAmount|formatPeso/.test(line)) {
        // hardcoded peso in UI chrome — flag only if clearly a format helper
        if (/function\s+money|const\s+money\s*=|fmtMoney|function\s+fmt/.test(line)) {
          hits.push({ file: rel, line: i + 1, text: trimmed.slice(0, 120), reason: "hardcoded peso in local formatter" });
        }
      }
    }

    // Local money helpers that duplicate shared/money
    if (/function\s+money\s*\(|const\s+money\s*=\s*\(|function\s+fmtMoney|const\s+fmtMoney|const\s+fmt\s*=\s*\(/.test(line)) {
      if (/toLocaleString|toFixed/.test(lines.slice(i, i + 8).join("\n"))) {
        hits.push({ file: rel, line: i + 1, text: trimmed.slice(0, 120), reason: "local money formatter — use shared/money" });
      }
    }

    // amount.toFixed(2) / balance.toFixed(4) etc.
    const toFixedMatch = line.match(/(\w+)\.toFixed\(([24])\)/);
    if (toFixedMatch) {
      const ident = toFixedMatch[1];
      if (MONEY_IDENT.test(ident) || MONEY_IDENT.test(line)) {
        // qty-like: skip if clearly qty
        if (/\bqty\b|quantity|received_qty|margin_pct/i.test(line) && !MONEY_IDENT.test(ident)) continue;
        hits.push({
          file: rel,
          line: i + 1,
          text: trimmed.slice(0, 120),
          reason: `${ident}.toFixed(${toFixedMatch[2]}) on money field`,
        });
      }
    }

    // money-ish.toLocaleString(
    if (/\.toLocaleString\s*\(/.test(line) && MONEY_IDENT.test(line)) {
      if (/date|Date|generatedAt|toISOString|timeZone/i.test(line)) continue;
      hits.push({
        file: rel,
        line: i + 1,
        text: trimmed.slice(0, 120),
        reason: "toLocaleString on money field — use formatMoney/formatAmount",
      });
    }
  }
  return hits;
}

describe("money call-site guard", () => {
  it("does not use raw toFixed/toLocaleString or local money helpers for display amounts", () => {
    const files = [...walk(ROOT), ...walk(SHARED)];
    const allHits = files.flatMap(scanFile);
    if (allHits.length > 0) {
      const msg = allHits.map((h) => `${h.file}:${h.line} [${h.reason}] ${h.text}`).join("\n");
      expect.fail(`${allHits.length} money formatting violation(s):\n${msg}`);
    }
  });
});
