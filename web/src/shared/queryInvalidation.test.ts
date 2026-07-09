import { describe, expect, it } from "vitest";
import { shouldSkipMutationInvalidation } from "./queryInvalidation";

describe("shouldSkipMutationInvalidation", () => {
  it("skips GET requests", () => {
    expect(shouldSkipMutationInvalidation("/api/v1/sales", "GET")).toBe(true);
  });

  it("skips read-only POST batch endpoints", () => {
    expect(
      shouldSkipMutationInvalidation("/api/v1/crm/follow-up-tasks/summaries", "POST"),
    ).toBe(true);
    expect(
      shouldSkipMutationInvalidation("/api/v1/inventory/items/search", "POST"),
    ).toBe(true);
    expect(
      shouldSkipMutationInvalidation("/api/v1/inventory/serial-units/resolve-scan/batch", "POST"),
    ).toBe(true);
  });

  it("skips presence and attachment uploads", () => {
    expect(shouldSkipMutationInvalidation("/api/v1/presence/heartbeat", "POST")).toBe(true);
    expect(shouldSkipMutationInvalidation("/api/v1/quotation/quotations/1/attachments", "POST")).toBe(
      true,
    );
  });

  it("does not skip real document creates", () => {
    expect(shouldSkipMutationInvalidation("/api/v1/quotation/quotations", "POST")).toBe(false);
    expect(shouldSkipMutationInvalidation("/api/v1/crm/follow-up-tasks", "POST")).toBe(false);
    expect(shouldSkipMutationInvalidation("/api/v1/operations/work-items", "POST")).toBe(false);
  });
});
