#!/usr/bin/env node
/**
 * API latency benchmark for Bluearm ERP v3.
 * Usage:
 *   node scripts/bench-api.mjs
 *   API_BASE=http://localhost:8080 BENCH_TOKEN=<jwt> node scripts/bench-api.mjs
 *
 * Target: p95 < 400ms warm for inventory list routes (with valid token).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const routes = JSON.parse(readFileSync(join(__dirname, "perf", "routes.core.json"), "utf8"));

const base = (process.env.API_BASE ?? "http://localhost:8080").replace(/\/$/, "");
const token = process.env.BENCH_TOKEN ?? "";
const iterations = Number(process.env.BENCH_ITERATIONS ?? 10);
const p95MaxMs = Number(process.env.BENCH_P95_MAX_MS ?? 400);

function percentile(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function hit(route) {
  const headers = {};
  if (route.auth !== false && token) headers.Authorization = `Bearer ${token}`;
  const start = performance.now();
  const res = await fetch(`${base}${route.path}`, { headers });
  const ms = performance.now() - start;
  const ok = route.expectedStatuses.includes(res.status);
  return { id: route.id, status: res.status, ms, ok };
}

async function benchRoute(route) {
  const samples = [];
  for (let i = 0; i < iterations; i++) {
    samples.push(await hit(route));
  }
  const times = samples.map((s) => s.ms).sort((a, b) => a - b);
  const p50 = percentile(times, 50);
  const p95 = percentile(times, 95);
  const allOk = samples.every((s) => s.ok);
  return { id: route.id, p50, p95, allOk, lastStatus: samples.at(-1)?.status };
}

const results = [];
for (const route of routes) {
  results.push(await benchRoute(route));
}

console.log("\nBluearm ERP v3 API bench\n");
console.log("base:", base, "| iterations:", iterations, "| token:", token ? "yes" : "no");
console.log("─".repeat(72));
let failed = false;
for (const r of results) {
  const over = token && r.p95 > p95MaxMs && !r.id.startsWith("health");
  if (!r.allOk || over) failed = true;
  const flag = over ? " ⚠ p95>" + p95MaxMs : !r.allOk ? " ✗ status" : "";
  console.log(
    `${r.id.padEnd(32)} p50=${r.p50.toFixed(1)}ms p95=${r.p95.toFixed(1)}ms status=${r.lastStatus}${flag}`,
  );
}
console.log("─".repeat(72));
if (failed) {
  console.error("Bench failed (unexpected status or p95 over target).");
  process.exit(1);
}
console.log("Bench passed.");
