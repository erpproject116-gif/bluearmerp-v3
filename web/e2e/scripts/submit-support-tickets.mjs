/**
 * Submit reviewed Support ticket drafts after dedupe.
 * Requires: E2E_SUBMIT_TICKETS=1, E2E_TICKET_DRAFTS path, and auth via cookie/token env.
 *
 * Default is dry-run (prints subjects only).
 *
 * Env:
 *   E2E_API_BASE          default https://api.bluearmerp.com
 *   E2E_TICKET_BEARER     Bearer token for API
 *   E2E_TENANT_ID         X-Tenant-ID header
 *   E2E_SUBMIT_TICKETS=1  actually POST
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const draftsPath =
  process.env.E2E_TICKET_DRAFTS ||
  process.argv[2] ||
  path.join(__dirname, "../.evidence/latest/ticket-drafts.json");

if (!fs.existsSync(draftsPath)) {
  console.error(`Drafts not found: ${draftsPath}`);
  console.error("Run: npm run e2e:tickets:draft");
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(draftsPath, "utf8"));
const apiBase = (process.env.E2E_API_BASE || "https://api.bluearmerp.com").replace(/\/$/, "");
const submit = process.env.E2E_SUBMIT_TICKETS === "1";
const bearer = process.env.E2E_TICKET_BEARER || "";
const tenantId = process.env.E2E_TENANT_ID || "";

console.log(`Drafts: ${payload.draftCount} from ${draftsPath}`);
console.log(`Mode: ${submit ? "SUBMIT" : "dry-run"}`);

const submitted = [];
for (const d of payload.drafts || []) {
  console.log(`- ${d.subject}`);
  if (!submit) continue;
  if (!bearer || !tenantId) {
    console.error("Need E2E_TICKET_BEARER and E2E_TENANT_ID to submit");
    process.exit(1);
  }
  const res = await fetch(`${apiBase}/api/v1/support/tickets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearer}`,
      "X-Tenant-ID": tenantId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      subject: d.subject,
      description: d.description,
      category: d.category || "technical",
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`Failed ${res.status}`, body);
    process.exit(1);
  }
  const id = body?.data?.id ?? body?.id;
  const ticketNo = body?.data?.ticket_no ?? body?.ticket_no;
  submitted.push({ subject: d.subject, id, ticketNo });
  console.log(`  -> ${ticketNo || id}`);
}

const out = path.join(path.dirname(draftsPath), "tickets-submitted.json");
fs.writeFileSync(
  out,
  JSON.stringify({ at: new Date().toISOString(), submitted, dryRun: !submit }, null, 2) + "\n",
);
console.log(`Wrote ${out}`);
