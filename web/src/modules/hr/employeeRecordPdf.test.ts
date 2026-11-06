import { describe, expect, it } from "vitest";
import { employeeRecordZipBaseName } from "./employeeRecordPdf";

describe("employeeRecordZipBaseName", () => {
  it("uses lastname-firstname-MM-DD-YYYY for comma names", () => {
    const when = new Date(2026, 10, 6); // Nov 6, 2026
    expect(employeeRecordZipBaseName('CRUZ, VICTORIA "Vic"', when)).toBe("cruz-victoria-11-06-2026");
  });

  it("falls back to first/last tokens without comma", () => {
    const when = new Date(2026, 0, 2);
    expect(employeeRecordZipBaseName("JOSE RACKY ARMECIN", when)).toBe("armecin-jose-01-02-2026");
  });
});
