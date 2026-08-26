import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./inventoryItemSearch", () => ({
  postInventoryItemSearch: vi.fn(),
  inventoryItemSearchErrorMessage: () => "search failed",
}));

import { postInventoryItemSearch } from "./inventoryItemSearch";
import { resolveInventoryItemByCode } from "./resolveInventoryItemByCode";

const postMock = vi.mocked(postInventoryItemSearch);

describe("resolveInventoryItemByCode", () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  it("returns exact match ignoring case", async () => {
    postMock.mockResolvedValue({
      success: true,
      data: [
        { id: 1, item_code: "00154", item_name: "Widget", sales_price: 10, status: "active" },
        { id: 2, item_code: "001540", item_name: "Other", sales_price: 1, status: "active" },
      ],
    } as never);
    const { item } = await resolveInventoryItemByCode("00154");
    expect(item?.id).toBe(1);
    expect(item?.item_name).toBe("Widget");
  });

  it("returns null when empty", async () => {
    const { item } = await resolveInventoryItemByCode("  ");
    expect(item).toBeNull();
    expect(postMock).not.toHaveBeenCalled();
  });

  it("returns null when no exact match", async () => {
    postMock.mockResolvedValue({
      success: true,
      data: [{ id: 2, item_code: "001540", item_name: "Other", sales_price: 1, status: "active" }],
    } as never);
    const { item } = await resolveInventoryItemByCode("00154");
    expect(item).toBeNull();
  });
});
