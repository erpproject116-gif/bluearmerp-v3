import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { softSkip } from "./entityForm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type TenantProfile = {
  /** Human label for reports */
  name: string;
  /** Expected tenant code when known (optional) */
  tenantCode?: string;
  partnerQuery: string;
  supplierQuery: string;
  itemQuery: string;
  /** Prefer this for buy-path serial posting when set (falls back to itemQuery). */
  serialItemQuery?: string;
  locationQuery: string;
  /** Open POs for GR receive (optional) */
  openPoCodes?: string[];
  /** Branch label shown in the shell when known (documentation only). */
  expectedBranch?: string;
};

const DEFAULT_PROFILE: TenantProfile = {
  name: "default-demo",
  tenantCode: "DEMO000",
  partnerQuery: "Seda",
  supplierQuery: "Seda",
  itemQuery: "Sofa",
  locationQuery: "Head",
  openPoCodes: ["DEMOGR902", "DEMOGR903"],
};

/**
 * Load tenant-specific lookup fixtures.
 * Prefer `E2E_TENANT_PROFILE` path, else `e2e/fixtures/tenant-profile.json`, else demo defaults.
 */
export function loadTenantProfile(): TenantProfile {
  const envPath = process.env.E2E_TENANT_PROFILE?.trim();
  const candidates = [
    envPath,
    path.join(__dirname, "../fixtures/tenant-profile.json"),
    path.join(__dirname, "../fixtures/tenant-profile.local.json"),
  ].filter(Boolean) as string[];

  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<TenantProfile>;
      return { ...DEFAULT_PROFILE, ...raw };
    } catch (e) {
      throw new Error(`Invalid tenant profile ${file}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { ...DEFAULT_PROFILE };
}

export function requireTenantLookups(
  testInfo: { annotations: { type: string; description?: string }[] },
  profile: TenantProfile,
) {
  if (!profile.partnerQuery?.trim() || !profile.itemQuery?.trim()) {
    softSkip(testInfo, "tenant profile missing partnerQuery/itemQuery");
  }
}
