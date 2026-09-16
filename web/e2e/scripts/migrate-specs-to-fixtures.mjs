/**
 * One-shot codemod: point specs at the live-safe fixtures.
 *
 *  - import { test, expect } from "@playwright/test"  ->  "./helpers/fixtures"
 *  - drop per-test `test.skip(!demoAuthAvailable(), ...)`; the fixture decides
 *  - demoSignIn -> ensureSignedIn (prefers saved storage state)
 *
 * Kept in the repo so the same rewrite can be replayed on specs added later.
 * Run from web/: node e2e/scripts/migrate-specs-to-fixtures.mjs [--dry]
 */
import fs from "node:fs";
import path from "node:path";

const dry = process.argv.includes("--dry");
const dir = path.resolve("e2e");

// auth-save bootstraps the storage state, so it must keep its own gating and
// its own unauthenticated page.
const SKIP_FILES = new Set(["auth-save.spec.ts"]);

const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".spec.ts") && !SKIP_FILES.has(f))
  .map((f) => path.join(dir, f));

let changed = 0;
for (const file of files) {
  const before = fs.readFileSync(file, "utf8");
  let text = before;

  text = text.replace(
    /^import\s*\{([^}]*)\}\s*from\s*"@playwright\/test";\s*$/m,
    (_m, names) => `import {${names}} from "./helpers/fixtures";`,
  );

  // Remove the skip lines entirely, including their trailing blank line.
  text = text.replace(
    /^[ \t]*test\.skip\(\s*!(?:demoAuthAvailable|liveAuthAvailable)\(\)\s*,[\s\S]*?\);[ \t]*\r?\n(?:[ \t]*\r?\n)?/gm,
    "",
  );

  text = text.replace(/\bdemoSignIn\(/g, "ensureSignedIn(");

  // Rebuild the auth helper import now that the call sites moved.
  text = text.replace(
    /^import\s*\{[^}]*\}\s*from\s*"\.\/helpers\/demoSignIn";\s*\r?\n/gm,
    "",
  );
  if (/\bensureSignedIn\(/.test(text) && !/from "\.\/helpers\/storageAuth"/.test(text)) {
    text = text.replace(
      /^(import\s*\{[^}]*\}\s*from\s*"\.\/helpers\/fixtures";\s*\r?\n)/m,
      `$1import { ensureSignedIn } from "./helpers/storageAuth";\n`,
    );
  } else if (/\bensureSignedIn\(/.test(text)) {
    text = text.replace(
      /^(import\s*\{)([^}]*)(\}\s*from\s*"\.\/helpers\/storageAuth";)/m,
      (m, a, names, c) =>
        names.includes("ensureSignedIn") ? m : `${a}${names.trimEnd()}, ensureSignedIn ${c}`,
    );
  }

  if (text !== before) {
    changed++;
    if (!dry) fs.writeFileSync(file, text);
    console.log(`${dry ? "would update" : "updated"} ${path.basename(file)}`);
  }
}
console.log(`${changed}/${files.length} spec files ${dry ? "would change" : "changed"}`);
