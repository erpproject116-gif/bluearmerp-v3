import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./queryClient", () => ({
  resetTenantScopedCache: vi.fn(),
}));

import { getActiveTenantId, setActiveTenantId, tenantPinGeneration } from "./activeContext";

describe("tenant pin generation", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("bumps only when the pinned business changes", () => {
    const start = tenantPinGeneration();
    setActiveTenantId(10);
    expect(getActiveTenantId()).toBe(10);
    expect(tenantPinGeneration()).toBe(start + 1);
    setActiveTenantId(10);
    expect(tenantPinGeneration()).toBe(start + 1);
    setActiveTenantId(20);
    expect(tenantPinGeneration()).toBe(start + 2);
    setActiveTenantId(null);
    expect(getActiveTenantId()).toBeNull();
    expect(tenantPinGeneration()).toBe(start + 3);
  });
});
