#!/usr/bin/env node
import { spawnSync } from "node:child_process";

process.env.E2E_FULL_ROUTE_SMOKE = "1";
const r = spawnSync("npx", ["playwright", "test", "e2e/route-smoke.spec.ts"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});
process.exit(r.status ?? 1);
