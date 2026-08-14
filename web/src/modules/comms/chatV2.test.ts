import { describe, expect, it } from "vitest";
import {
  COPILOT_SEED_STORAGE_KEYS,
  isNavigateOnlyDraftType,
  seedStorageKeyForDraftType,
  stageApprovedCopilotResult,
} from "../../shared/copilotApproveHandoff";
import { formatChatUnreadBadge } from "./useChatUnreadTotal";
import { CHAT_REACTION_EMOJIS } from "./chatApi";

describe("formatChatUnreadBadge", () => {
  it("hides zero", () => {
    expect(formatChatUnreadBadge(0)).toBe("");
  });
  it("shows counts under 100", () => {
    expect(formatChatUnreadBadge(7)).toBe("7");
  });
  it("caps at 99+", () => {
    expect(formatChatUnreadBadge(100)).toBe("99+");
    expect(formatChatUnreadBadge(999)).toBe("99+");
  });
});

describe("CHAT_REACTION_EMOJIS", () => {
  it("exposes the fixed subset", () => {
    expect(CHAT_REACTION_EMOJIS).toEqual(["👍", "❤️", "😂", "👀", "✅"]);
  });
});

describe("copilotApproveHandoff", () => {
  it("maps open_quotation to doc seed key", () => {
    expect(seedStorageKeyForDraftType("open_quotation")).toBe("bluearm.docSeed.quotation");
    expect(COPILOT_SEED_STORAGE_KEYS.open_sales_order).toBe("bluearm.docSeed.sales_order");
  });

  it("does not stage unknown draft types", () => {
    const key = "bluearm.docSeed.should_not_exist";
    sessionStorage.removeItem(key);
    const r = stageApprovedCopilotResult("not_a_real_type", { seed: { partner_id: 1 }, next: "/app/x" });
    expect(r.ok).toBe(true);
    expect(sessionStorage.getItem(key)).toBeNull();
  });

  it("stages known seed keys", () => {
    const key = COPILOT_SEED_STORAGE_KEYS.open_quotation!;
    sessionStorage.removeItem(key);
    const r = stageApprovedCopilotResult("open_quotation", { seed: { partner_name: "Acme" } });
    expect(r.ok).toBe(true);
    expect(JSON.parse(sessionStorage.getItem(key)!)).toEqual({ partner_name: "Acme" });
    sessionStorage.removeItem(key);
  });

  it("marks ticket/crm/baiko as navigate-only", () => {
    expect(isNavigateOnlyDraftType("open_support_tickets")).toBe(true);
    expect(isNavigateOnlyDraftType("open_crm")).toBe(true);
    expect(isNavigateOnlyDraftType("open_baiko")).toBe(true);
    expect(isNavigateOnlyDraftType("open_quotation")).toBe(false);
  });
});
