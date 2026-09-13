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

function row(partial: Partial<CrmNotification> & Pick<CrmNotification, "id">): CrmNotification {
  return {
    severity: "info",
    title: "t",
    body: "",
    created_at: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

describe("crmNotificationHref", () => {
  it("prefers API href when present", () => {
    const n = row({
      id: 1,
      href: "/app/sales/sales?openId=5",
      entity_type: "sa_sales",
      entity_id: 5,
    });
    expect(crmNotificationHref(n)).toBe("/app/sales/sales?openId=5");
  });

  it("falls back to entity mapping for quotations", () => {
    const n = row({ id: 1, entity_type: "quo_quotation", entity_id: 12 });
    expect(crmNotificationHref(n)).toBe("/app/quotation/quotations?openId=12");
  });

  it("uses purchase-order list for PO without id", () => {
    const n = row({ id: 1, entity_type: "po_purchase_order" });
    expect(crmNotificationHref(n)).toBe("/app/purchase-order/purchase-orders");
  });

  it("maps purchase order, PR, RFQ, GR, WO, and recipe BOM", () => {
    expect(crmNotificationHref(row({ id: 1, entity_type: "po_purchase_order", entity_id: 3 }))).toBe(
      "/app/purchase-order/purchase-orders?openId=3",
    );
    expect(crmNotificationHref(row({ id: 1, entity_type: "pr_purchase_request", entity_id: 4 }))).toBe(
      "/app/purchase-request/purchase-requests?openId=4",
    );
    expect(crmNotificationHref(row({ id: 1, entity_type: "rfq_request", entity_id: 5 }))).toBe(
      "/app/purchase-order/rfq/5",
    );
    expect(crmNotificationHref(row({ id: 1, entity_type: "gr_goods_receipt", entity_id: 6 }))).toBe(
      "/app/purchases/purchase-receive?openId=6",
    );
    expect(crmNotificationHref(row({ id: 1, entity_type: "mfg_work_order", entity_id: 7 }))).toBe(
      "/app/production/assembly/jobs?openId=7",
    );
    expect(crmNotificationHref(row({ id: 1, entity_type: "mfg_bom", entity_id: 8 }))).toBe(
      "/app/production/recipe/recipes?openId=8",
    );
  });

  it("never loops to notifications inbox when entity_id is set", () => {
    const n = row({ id: 1, entity_type: "unknown_thing", entity_id: 99 });
    expect(crmNotificationHref(n)).toBe("/app/activity-logs/changes?target_type=unknown_thing&target_id=99");
    expect(crmNotificationHref(n)).not.toContain("/app/crm/notifications");
  });

  it("maps chat_message entity", () => {
    const n = row({ id: 1, entity_type: "chat_message", entity_id: 42 });
    expect(crmNotificationHref(n)).toBe("/app/comms/chat?messageId=42");
  });

  it("maps meeting entity to Operations calendar", () => {
    const n = row({ id: 1, entity_type: "meeting", entity_id: 42 });
    expect(crmNotificationHref(n)).toBe("/app/operations/calendar");
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
