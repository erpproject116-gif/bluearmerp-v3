#!/usr/bin/env node
/**
 * Mint a Supabase-compatible HS256 JWT for API bench / CI.
 * Usage:
 *   node scripts/mint-bench-jwt.mjs
 *   SUPABASE_JWT_SECRET=... node scripts/mint-bench-jwt.mjs
 *
 * Prints token to stdout (no trailing newline required by callers using $(...)).
 */
import { createHmac } from "node:crypto";

const secret = process.env.SUPABASE_JWT_SECRET ?? "ci-test-jwt-secret-min-32-chars-long";
const sub = process.env.BENCH_AUTH_SUB ?? "00000000-0000-4000-8000-000000000001";
const email = process.env.BENCH_AUTH_EMAIL ?? "demo@demo.bluearm.local";
const ttlSec = Number(process.env.BENCH_JWT_TTL_SEC ?? 3600);

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

const now = Math.floor(Date.now() / 1000);
const header = b64url({ alg: "HS256", typ: "JWT" });
const payload = b64url({
  sub,
  email,
  role: "authenticated",
  aud: "authenticated",
  iss: "bench",
  iat: now,
  exp: now + ttlSec,
});
const data = `${header}.${payload}`;
const sig = createHmac("sha256", secret).update(data).digest("base64url");
process.stdout.write(`${data}.${sig}`);
