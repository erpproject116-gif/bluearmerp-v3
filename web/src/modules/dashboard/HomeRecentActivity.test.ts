import { describe, expect, it } from "vitest";
import { isHomeFeedRow } from "./HomeRecentActivity";
import type { ActivityLogRow } from "../../shared/useActivityLogList";

function row(partial: Partial<ActivityLogRow> & Pick<ActivityLogRow, "target_type" | "action_code">): ActivityLogRow {
  return {
    id: 1,
    created_at: new Date().toISOString(),
    ...partial,
  };
}

describe("isHomeFeedRow", () => {
  it("allows sales and payments", () => {
    expect(isHomeFeedRow(row({ target_type: "sa_sales", action_code: "sales.updated" }))).toBe(true);
    expect(isHomeFeedRow(row({ target_type: "fin_official_receipt", action_code: "finance.created" }))).toBe(true);
  });

  it("rejects API, auth, and support noise", () => {
    expect(isHomeFeedRow(row({ target_type: "http", action_code: "api.post" }))).toBe(false);
    expect(isHomeFeedRow(row({ target_type: "auth", action_code: "auth.session_ended" }))).toBe(false);
    expect(isHomeFeedRow(row({ target_type: "support_ticket", action_code: "support.updated" }))).toBe(false);
  });
});
