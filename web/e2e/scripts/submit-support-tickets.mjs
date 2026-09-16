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

/**
 * Fetch tickets that are still open so a weekly run does not re-file last week's
 * findings. Without this the suite dedupes only inside a single drafts file, and
 * every run adds another copy of the same bug to the queue until nobody reads it.
 */
async function openTicketFingerprints() {
  if (!bearer || !tenantId) return null;
  const fingerprints = new Set();
  for (let page = 1; page <= 10; page += 1) {
    const res = await fetch(
      `${apiBase}/api/v1/support/tickets?status=open&page=${page}&page_size=100`,
      { headers: { Authorization: `Bearer ${bearer}`, "X-Tenant-ID": tenantId } },
    ).catch(() => null);
    if (!res?.ok) return fingerprints.size ? fingerprints : null;
    const body = await res.json().catch(() => ({}));
    const rows = body?.data?.items ?? body?.data ?? body?.items ?? [];
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const t of rows) {
      const status = String(t.status ?? "").toLowerCase();
      if (status === "closed" || status === "resolved") continue;
      // draft-support-tickets.mjs embeds the dedupe key in the description.
      const key = /dedupeKey:\s*([\w.:-]+)/i.exec(String(t.description ?? ""))?.[1];
      if (key) fingerprints.add(key.toLowerCase());
      if (t.subject) fingerprints.add(String(t.subject).trim().toLowerCase());
    }
    if (rows.length < 100) break;
  }
  return fingerprints;
}

const openKeys = await openTicketFingerprints();
if (openKeys === null) {
  console.log("Dedupe: skipped (no API credentials, or the tickets endpoint did not answer).");
} else {
  console.log(`Dedupe: ${openKeys.size} fingerprint(s) from open tickets.`);
}

function alreadyOpen(draft) {
  if (!openKeys) return false;
  const fingerprint = String(draft.fingerprint ?? "").toLowerCase();
  if (fingerprint && openKeys.has(fingerprint)) return true;
  return openKeys.has(String(draft.subject ?? "").trim().toLowerCase());
}

const submitted = [];
const skipped = [];
for (const d of payload.drafts || []) {
  if (alreadyOpen(d)) {
    skipped.push({ subject: d.subject, fingerprint: d.fingerprint, why: "already open" });
    console.log(`- ${d.subject}  [skipped: already open]`);
    continue;
  }
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
  JSON.stringify(
    { at: new Date().toISOString(), submitted, skipped, dryRun: !submit },
    null,
    2,
  ) + "\n",
);
console.log(
  `Wrote ${out} (${submitted.length} submitted, ${skipped.length} skipped as already open)`,
);
