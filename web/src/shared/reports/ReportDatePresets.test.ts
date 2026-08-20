import { describe, expect, it } from "vitest";
import {
  inferReportDatePreset,
  localISODate,
  resolveReportDatePreset,
  withReportDateQuery,
} from "./ReportDatePresets";

describe("resolveReportDatePreset", () => {
  const now = new Date(2026, 7, 20); // Aug 20, 2026

  it("resolves this month through today", () => {
    expect(resolveReportDatePreset("this_month", now)).toEqual({
      date_from: "2026-08-01",
      date_to: "2026-08-20",
    });
  });

  it("resolves previous quarter", () => {
    expect(resolveReportDatePreset("prev_quarter", now)).toEqual({
      date_from: "2026-04-01",
      date_to: "2026-06-30",
    });
  });

  it("infers custom when dates do not match a preset", () => {
    expect(inferReportDatePreset("2021-12-01", "2021-12-31", now)).toBe("custom");
  });
});

describe("withReportDateQuery", () => {
  it("appends dates and keeps a hash", () => {
    expect(withReportDateQuery("/app/finance/acct-i/reports/profit-and-loss#top", "2026-08-01", "2026-08-20")).toBe(
      "/app/finance/acct-i/reports/profit-and-loss?date_from=2026-08-01&date_to=2026-08-20#top",
    );
  });
});

describe("localISODate", () => {
  it("formats local calendar dates", () => {
    expect(localISODate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
