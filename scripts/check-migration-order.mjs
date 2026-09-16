/**
 * Detect migrations that reference a table before it is created.
 *
 * A fresh database applies migrations in filename order. A foreign key that
 * points at a table created by a later file aborts that migration's whole
 * transaction, and every migration that depends on it then fails too. The
 * production database does not notice, because its schema was built up over
 * time, so this only shows up when someone bootstraps from scratch - which is
 * exactly what CI does.
 *
 * Usage: node scripts/check-migration-order.mjs
 * Exits non-zero when a forward reference is found.
 */
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve("api/migrations");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

/** table name -> first migration that creates it */
const createdIn = new Map();
const contents = new Map();

for (const f of files) {
  const sql = fs.readFileSync(path.join(dir, f), "utf8");
  contents.set(f, sql);
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?("?[\w]+"?)/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const name = m[1].replace(/"/g, "").toLowerCase();
    if (!createdIn.has(name)) createdIn.set(name, f);
  }
}

const problems = [];
for (const f of files) {
  const sql = contents.get(f);
  const re = /references\s+(?:public\.)?("?[\w]+"?)\s*\(/gi;
  let m;
  const seen = new Set();
  while ((m = re.exec(sql)) !== null) {
    const target = m[1].replace(/"/g, "").toLowerCase();
    if (seen.has(target)) continue;
    seen.add(target);
    const origin = createdIn.get(target);
    if (!origin) continue; // created outside migrations (extensions, auth schema)
    if (origin > f) {
      const line = sql.slice(0, m.index).split("\n").length;
      problems.push(`${f}:${line} references public.${target}, created later in ${origin}`);
    }
  }
}

if (problems.length) {
  console.error(`Forward references found (${problems.length}):`);
  for (const p of problems) console.error(`  ${p}`);
  console.error("\nA fresh database cannot apply these in order.");
  process.exit(1);
}
console.log(`No forward references across ${files.length} migrations.`);
