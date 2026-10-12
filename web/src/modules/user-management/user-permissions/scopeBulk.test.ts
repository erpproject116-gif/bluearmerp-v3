import { describe, expect, it } from "vitest";
import { clearScopeTypes, selectLoadedScopes, setLocationScope } from "./scopeBulk";

describe("data scope bulk select", () => {
  it("selects loaded customers and leaves other types", () => {
    const next = selectLoadedScopes(
      [{ scope_type: "location", record_id: 9 }],
      ["customer"],
      [1, 2],
    );
    expect(next).toEqual([
      { scope_type: "location", record_id: 9 },
      { scope_type: "customer", record_id: 1 },
      { scope_type: "customer", record_id: 2 },
    ]);
  });

  it("writes location and warehouse together", () => {
    const on = setLocationScope([], 4, true);
    expect(on).toEqual([
      { scope_type: "location", record_id: 4 },
      { scope_type: "warehouse", record_id: 4 },
    ]);
    expect(setLocationScope(on, 4, false)).toEqual([]);
  });

  it("select all locations writes both types for loaded rows only", () => {
    const next = selectLoadedScopes(
      [{ scope_type: "customer", record_id: 1 }, { scope_type: "location", record_id: 99 }],
      ["location", "warehouse"],
      [7],
    );
    expect(next).toContainEqual({ scope_type: "location", record_id: 7 });
    expect(next).toContainEqual({ scope_type: "warehouse", record_id: 7 });
    expect(next).toContainEqual({ scope_type: "location", record_id: 99 });
  });

  it("deselect clears both location and warehouse, including rows not on the page", () => {
    const next = clearScopeTypes(
      [
        { scope_type: "customer", record_id: 1 },
        { scope_type: "location", record_id: 7 },
        { scope_type: "warehouse", record_id: 7 },
        { scope_type: "warehouse", record_id: 99 },
      ],
      ["location", "warehouse"],
    );
    expect(next).toEqual([{ scope_type: "customer", record_id: 1 }]);
  });
});
