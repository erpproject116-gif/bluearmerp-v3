import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  crmNotificationHref,
  crmNotificationRelativeTime,
  crmNotificationSourceLabel,
  crmSeverityToastType,
} from "./crmNotificationRoutes";
import type { CrmNotification } from "./useCrmNotifications";

const SHARED = __dirname;
const read = (file: string) => fs.readFileSync(path.resolve(SHARED, file), "utf8");

describe("crmNotificationHref", () => {
  it("prefers API href when present", () => {
    const n: CrmNotification = {
      id: 1,
      severity: "info",
      title: "t",
      body: "",
      created_at: "2026-01-01T00:00:00Z",
      href: "/app/sales/sales?openId=5",
      entity_type: "sa_sales",
      entity_id: 5,
    };
    expect(crmNotificationHref(n)).toBe("/app/sales/sales?openId=5");
  });

  it("falls back to entity mapping for quotations", () => {
    const n: CrmNotification = {
      id: 1,
      severity: "warning",
      title: "t",
      body: "",
      created_at: "2026-01-01T00:00:00Z",
      entity_type: "quo_quotation",
      entity_id: 12,
    };
    expect(crmNotificationHref(n)).toBe("/app/quotation/quotations?openId=12");
  });
});

describe("crmSeverityToastType", () => {
  it("maps severities without treating info as success", () => {
    expect(crmSeverityToastType("critical")).toBe("error");
    expect(crmSeverityToastType("warning")).toBe("warning");
    expect(crmSeverityToastType("info")).toBe("info");
  });
});

describe("crmNotificationSourceLabel", () => {
  it("labels known sources", () => {
    expect(crmNotificationSourceLabel("rule")).toBe("Alert");
    expect(crmNotificationSourceLabel("support")).toBe("Support");
    expect(crmNotificationSourceLabel("chat")).toBe("Chat");
    expect(crmNotificationSourceLabel("activity")).toBe("Activity");
  });

  it("maps chat_message entity", () => {
    const n: CrmNotification = {
      id: 1,
      severity: "info",
      title: "t",
      body: "",
      created_at: "2026-01-01T00:00:00Z",
      entity_type: "chat_message",
      entity_id: 42,
    };
    expect(crmNotificationHref(n)).toBe("/app/comms/chat?messageId=42");
  });
});

describe("crmNotificationRelativeTime", () => {
  it("formats recent times", () => {
    const now = Date.parse("2026-08-13T12:00:00Z");
    expect(crmNotificationRelativeTime("2026-08-13T11:59:30Z", now)).toBe("just now");
    expect(crmNotificationRelativeTime("2026-08-13T11:00:00Z", now)).toBe("1h ago");
  });
});

describe("mark-read stays silent", () => {
  it("useCrmNotifications mark helpers use silent: true", () => {
    const src = read("useCrmNotifications.ts");
    expect(src).toContain("silent: true");
    expect(src).not.toContain("successMessage:");
  });
});
