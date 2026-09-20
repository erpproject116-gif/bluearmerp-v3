import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./resolveAppEntryPath", () => ({
  resolveAppEntryPath: vi.fn(),
}));

import { resolveAppEntryPath } from "./resolveAppEntryPath";
import {
  RETURN_TO_STORAGE_KEY,
  buildSignInHref,
  captureReturnTo,
  clearReturnTo,
  consumeReturnTo,
  resolvePostLoginPath,
  sanitizeReturnTo,
  stashNextFromSearch,
} from "./authReturnTo";

describe("sanitizeReturnTo", () => {
  it("allows /app and /portal paths with query/hash", () => {
    expect(sanitizeReturnTo("/app/inventory/find-stock?q=1")).toBe("/app/inventory/find-stock?q=1");
    expect(sanitizeReturnTo("/app/sales/sales#row-2")).toBe("/app/sales/sales#row-2");
    expect(sanitizeReturnTo("/portal/dashboard")).toBe("/portal/dashboard");
    expect(sanitizeReturnTo("/app")).toBe("/app");
  });

  it("rejects open redirects and auth loops", () => {
    expect(sanitizeReturnTo("https://evil.com")).toBeNull();
    expect(sanitizeReturnTo("//evil.com")).toBeNull();
    expect(sanitizeReturnTo("/\\evil.com")).toBeNull();
    expect(sanitizeReturnTo("javascript:alert(1)")).toBeNull();
    expect(sanitizeReturnTo("/signin")).toBeNull();
    expect(sanitizeReturnTo("/signin?x=1")).toBeNull();
    expect(sanitizeReturnTo("/auth/callback")).toBeNull();
    expect(sanitizeReturnTo("/welcome")).toBeNull();
    expect(sanitizeReturnTo("/dashboard")).toBeNull();
    expect(sanitizeReturnTo("")).toBeNull();
    expect(sanitizeReturnTo(null)).toBeNull();
  });

  it("decodes percent-encoded next values", () => {
    expect(sanitizeReturnTo("%2Fapp%2Fsales%2Fsales%3Fid%3D1")).toBe("/app/sales/sales?id=1");
    expect(sanitizeReturnTo("%2F%2Fevil.com")).toBeNull();
  });
});

describe("sessionStorage return-to", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("captures, consumes once, and clears", () => {
    captureReturnTo("/app/finance/journal-entries");
    expect(sessionStorage.getItem(RETURN_TO_STORAGE_KEY)).toBe("/app/finance/journal-entries");
    expect(consumeReturnTo()).toBe("/app/finance/journal-entries");
    expect(consumeReturnTo()).toBeNull();
  });

  it("ignores unsafe capture targets", () => {
    captureReturnTo("https://evil.com/phish");
    expect(sessionStorage.getItem(RETURN_TO_STORAGE_KEY)).toBeNull();
  });

  it("clearReturnTo removes stored value", () => {
    captureReturnTo("/app/dashboard");
    clearReturnTo();
    expect(consumeReturnTo()).toBeNull();
  });

  it("stashNextFromSearch persists safe next", () => {
    stashNextFromSearch("?reason=idle&next=%2Fapp%2Finventory%2Fitems");
    expect(consumeReturnTo()).toBe("/app/inventory/items");
  });

  it("buildSignInHref encodes reason and next", () => {
    expect(buildSignInHref({ reason: "idle", next: "/app/sales/sales" })).toBe(
      "/signin?reason=idle&next=%2Fapp%2Fsales%2Fsales",
    );
    expect(buildSignInHref({ next: "https://evil.com" })).toBe("/signin");
  });
});

describe("resolvePostLoginPath", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.mocked(resolveAppEntryPath).mockReset();
  });

  it("prefers return-to over role home when setup is not required", async () => {
    vi.mocked(resolveAppEntryPath).mockResolvedValue("/app/dashboard");
    captureReturnTo("/app/inventory/find-stock");
    await expect(resolvePostLoginPath({} as never)).resolves.toBe("/app/inventory/find-stock");
  });

  it("keeps setup path and does not consume return-to", async () => {
    vi.mocked(resolveAppEntryPath).mockResolvedValue("/app/setup");
    captureReturnTo("/app/sales/sales");
    await expect(resolvePostLoginPath({} as never)).resolves.toBe("/app/setup");
    expect(consumeReturnTo()).toBe("/app/sales/sales");
  });
});
