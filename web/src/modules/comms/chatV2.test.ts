import { describe, expect, it } from "vitest";
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
