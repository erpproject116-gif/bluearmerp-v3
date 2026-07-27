import { describe, expect, it } from "vitest";
import { DEFAULT_BRANDING } from "./defaults";
import {
  normalizePrintHeaderLines,
  resolvePrintCompanyName,
  resolvePrintHeaderText,
} from "./receiptBranding";

describe("normalizePrintHeaderLines", () => {
  it("drops an exact company-name line", () => {
    expect(normalizePrintHeaderLines("Bluearm Computers", "Bluearm Computers\n1205 Hernan Cortes St")).toBe(
      "1205 Hernan Cortes St",
    );
  });

  it("strips company name prefix from a combined address line", () => {
    expect(
      normalizePrintHeaderLines(
        "Bluearm Computers",
        "Bluearm Computers 1205 Hernan Cortes St, Mandaue, 6014 Cebu",
      ),
    ).toBe("1205 Hernan Cortes St, Mandaue, 6014 Cebu");
  });

  it("keeps contact and tax lines", () => {
    const out = normalizePrintHeaderLines(
      "Bluearm Computers",
      "Bluearm Computers\n0322632502 · rogy@bluearm.ph\nTax ID: 311-263-954-00001",
    );
    expect(out).toBe("0322632502 · rogy@bluearm.ph\nTax ID: 311-263-954-00001");
  });
});

describe("resolvePrintHeaderText", () => {
  it("does not repeat company name when header_text duplicates it", () => {
    const branding = {
      ...DEFAULT_BRANDING,
      receipt: {
        ...DEFAULT_BRANDING.receipt,
        company_name: "Bluearm Computers",
        header_text: "Bluearm Computers",
        address: "1205 Hernan Cortes St, Mandaue, 6014 Cebu",
        phone: "0322632502",
        email: "rogy@bluearm.ph",
        tax_id: "311-263-954-00001",
      },
    };
    const meta = resolvePrintHeaderText(undefined, branding);
    expect(meta.toLowerCase()).not.toContain("bluearm computers");
    expect(meta).toContain("1205 Hernan Cortes");
    expect(meta).toContain("Tax ID:");
  });
});

describe("resolvePrintCompanyName", () => {
  it("prefers receipt company then tenant fallback", () => {
    expect(resolvePrintCompanyName(undefined, DEFAULT_BRANDING, "Tenant Co")).toBe("Tenant Co");
    const withReceipt = {
      ...DEFAULT_BRANDING,
      receipt: { ...DEFAULT_BRANDING.receipt, company_name: "Receipt Co" },
    };
    expect(resolvePrintCompanyName(undefined, withReceipt, "Tenant Co")).toBe("Receipt Co");
  });
});
