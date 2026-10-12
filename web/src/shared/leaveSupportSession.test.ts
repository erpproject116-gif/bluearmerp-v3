import { describe, expect, it } from "vitest";
import { restoredTenantId } from "./leaveSupportSession";

describe("restoredTenantId", () => {
  const memberships = [{ tenant_id: 4 }, { tenant_id: 9 }];

  it("returns the previous business when that membership is still active", () => {
    expect(restoredTenantId(4, memberships)).toBe(4);
  });

  it("does not assign a business when there is no previous workspace", () => {
    expect(restoredTenantId(null, memberships)).toBeNull();
    expect(restoredTenantId(0, memberships)).toBeNull();
    expect(restoredTenantId(undefined, memberships)).toBeNull();
  });

  it("does not assign a previous business that is no longer an active membership", () => {
    expect(restoredTenantId(12, memberships)).toBeNull();
  });
});
