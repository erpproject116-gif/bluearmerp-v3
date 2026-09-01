import { describe, expect, it } from "vitest";
import {
  buildPartnerContactPayload,
  normalizePHTIN,
  normalizePHMobileLocal,
  PHTIN_VALIDATION_MESSAGE,
  validatePartnerContact,
} from "./phContact";

describe("phContact", () => {
  it("normalizes PH mobile to local 09 format", () => {
    expect(normalizePHMobileLocal("917-123-4567")).toBe("09171234567");
  });

  it("normalizes TIN with spaces", () => {
    expect(normalizePHTIN("209-161-308- 000")).toBe("209-161-308-000");
  });

  it("accepts individual 9-digit TIN", () => {
    expect(normalizePHTIN("123456789")).toBe("123-456-789");
  });

  it("accepts branch office TIN", () => {
    expect(normalizePHTIN("123-456-789-001")).toBe("123-456-789-001");
  });

  it("rejects invalid TIN lengths", () => {
    expect(validatePartnerContact({ tin: "12345" }).tin).toBe(PHTIN_VALIDATION_MESSAGE);
  });

  it("validates partner contact fields", () => {
    const errors = validatePartnerContact({ email: "bad@", mobile: "09171234567" });
    expect(errors.email).toBeTruthy();
    expect(errors.mobile).toBeUndefined();
  });

  it("builds normalized payload", () => {
    expect(
      buildPartnerContactPayload({
        mobile: "917 123 4567",
        tin: "311263954",
      }),
    ).toEqual({
      mobile: "09171234567",
      phone: null,
      email: null,
      tin: "311-263-954",
    });
  });
});
