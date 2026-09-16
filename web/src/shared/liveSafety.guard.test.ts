/**
 * Unit test for liveSafety helpers (no browser).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  currentTier,
  mutationsAllowed,
  redactSecrets,
  isExternalBaseUrl,
} from "../../e2e/helpers/liveSafety";

describe("liveSafety helpers", () => {
  const keys = ["E2E_TIER", "E2E_ALLOW_MUTATIONS", "E2E_RUN_CONFIRM", "E2E_BASE_URL"] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of keys) saved[k] = process.env[k];
  });
  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("defaults to read-only and blocks mutations", () => {
    delete process.env.E2E_TIER;
    delete process.env.E2E_ALLOW_MUTATIONS;
    delete process.env.E2E_RUN_CONFIRM;
    expect(currentTier()).toBe("read-only");
    expect(mutationsAllowed()).toBe(false);
  });

  it("allows mutations only with tier + flag + confirm", () => {
    process.env.E2E_TIER = "reversible";
    process.env.E2E_ALLOW_MUTATIONS = "1";
    process.env.E2E_RUN_CONFIRM = "run-1";
    expect(mutationsAllowed()).toBe(true);
  });

  it("redacts bearer tokens", () => {
    expect(redactSecrets("Authorization: Bearer abc.def.ghi")).toContain("[REDACTED]");
  });

  it("detects external base URL", () => {
    process.env.E2E_BASE_URL = "https://app.bluearmerp.com";
    expect(isExternalBaseUrl()).toBe(true);
    process.env.E2E_BASE_URL = "http://localhost:5173";
    expect(isExternalBaseUrl()).toBe(false);
  });
});
