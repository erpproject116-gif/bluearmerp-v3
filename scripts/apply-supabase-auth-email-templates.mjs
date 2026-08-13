#!/usr/bin/env node
/**
 * Apply BluearmERP Auth email templates to a hosted Supabase project.
 *
 * Requires:
 *   SUPABASE_ACCESS_TOKEN  — https://supabase.com/dashboard/account/tokens
 *   SUPABASE_PROJECT_REF   — e.g. hqmhlvahlvrtxtwecdip (or pass --project-ref=)
 *
 * Does NOT change confirm-email, SMTP, or redirect URLs.
 *
 * Usage (from bluearmerp-v3/):
 *   node scripts/apply-supabase-auth-email-templates.mjs
 *   node scripts/apply-supabase-auth-email-templates.mjs --project-ref=YOUR_REF
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const templatesDir = path.join(root, "supabase", "templates");

const argRef = process.argv.find((a) => a.startsWith("--project-ref="))?.slice("--project-ref=".length);
const projectRef = (argRef || process.env.SUPABASE_PROJECT_REF || "").trim();
const token = (process.env.SUPABASE_ACCESS_TOKEN || "").trim();

if (!token) {
  console.error("Missing SUPABASE_ACCESS_TOKEN (create at https://supabase.com/dashboard/account/tokens).");
  process.exit(1);
}
if (!projectRef) {
  console.error("Missing SUPABASE_PROJECT_REF or --project-ref=");
  process.exit(1);
}

const read = (name) => fs.readFileSync(path.join(templatesDir, name), "utf8");

const body = {
  mailer_subjects_confirmation: "Confirm your BluearmERP account",
  mailer_templates_confirmation_content: read("confirmation.html"),
  mailer_subjects_recovery: "Reset your BluearmERP password",
  mailer_templates_recovery_content: read("recovery.html"),
  mailer_subjects_magic_link: "Your BluearmERP demo code",
  mailer_templates_magic_link_content: read("magic_link.html"),
};

const url = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;
const res = await fetch(url, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

const text = await res.text();
if (!res.ok) {
  console.error(`PATCH failed ${res.status}: ${text}`);
  process.exit(1);
}

console.log(`Applied Auth email templates to project ${projectRef}.`);
console.log("Next: verify Redirect URLs include /auth/callback and /auth/reset-password, then run the smoke matrix in docs/runbooks/supabase-auth-emails-smoke.md");
