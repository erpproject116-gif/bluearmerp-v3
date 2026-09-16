import { describe, expect, it } from "vitest";
import { supabaseAuthStorageKey } from "../../e2e/helpers/benchAuth";

describe("supabaseAuthStorageKey", () => {
  it("matches @supabase/supabase-js for 127.0.0.1 (CI demo-smoke)", () => {
    expect(supabaseAuthStorageKey("http://127.0.0.1")).toBe("sb-127-auth-token");
  });

  it("matches project-ref hosts", () => {
    expect(supabaseAuthStorageKey("https://hqmhlvahlvrtxtwecdip.supabase.co")).toBe(
      "sb-hqmhlvahlvrtxtwecdip-auth-token",
    );
  });
});
