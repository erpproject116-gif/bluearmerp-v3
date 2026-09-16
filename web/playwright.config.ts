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

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const externalBase =
  /^https?:\/\//i.test(baseURL) && !/localhost|127\.0\.0\.1/i.test(baseURL);
const storageStatePath = path.join(root, "e2e/.auth/user.json");
const useStorageState =
  process.env.E2E_USE_STORAGE_STATE !== "0" && fs.existsSync(storageStatePath);

/** Do not start Vite when targeting a deployed URL or CI. */
const skipWebServer = Boolean(process.env.CI) || externalBase || process.env.E2E_NO_WEBSERVER === "1";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/helpers/**", "**/scripts/**", "**/fixtures/**"],
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 1,
  timeout: 120_000,
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
    ...(useStorageState ? { storageState: storageStatePath } : {}),
  },
  projects: [
    {
      name: "read-only",
      grep: /@read-only|@smoke/,
      grepInvert: /@mutating|@posting|@auth-save/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "reversible",
      grep: /@mutating|@reversible/,
      grepInvert: /@posting|@auth-save/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "posting",
      grep: /@posting/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "auth-save",
      grep: /@auth-save/,
      use: { ...devices["Desktop Chrome"], storageState: undefined },
    },
    {
      // Full suite (local/CI default when no project selected via CLI)
      name: "chromium",
      grepInvert: /@auth-save/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: skipWebServer
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:5173",
        reuseExistingServer: true,
      },
});
