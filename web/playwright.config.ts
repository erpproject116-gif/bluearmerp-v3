import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

/** Load KEY=VAL from a dotenv file without overriding existing process.env. */
function loadEnvFile(file: string) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvFile(path.join(root, ".env.local"));
loadEnvFile(path.join(root, ".env"));
loadEnvFile(path.join(root, "..", ".env"));

// Local convenience: reuse DEMO_USER_PASSWORD when E2E_DEMO_PASSWORD is unset.
if (!process.env.E2E_DEMO_PASSWORD && process.env.DEMO_USER_PASSWORD) {
  process.env.E2E_DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD;
}

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/helpers/**", "**/scripts/**", "**/fixtures/**"],
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 1,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.CI
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:5173",
        reuseExistingServer: true,
      },
});
