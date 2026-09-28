import { describe, expect, it } from "vitest";
import { IDLE_LOGOUT_MS } from "./sessionIdleClient";
import { mountActivityBase, shouldHandleServerSessionIdle } from "./sessionIdleDecision";

describe("shouldHandleServerSessionIdle", () => {
  it("ignores a silent idle response that started on the auth callback", () => {
    expect(
      shouldHandleServerSessionIdle({ silent: true }, "/auth/callback"),
    ).toBe(false);
  });

  it("ignores idle when the request started on sign-in even if the app has since navigated", () => {
    expect(shouldHandleServerSessionIdle(undefined, "/auth/callback")).toBe(false);
    expect(shouldHandleServerSessionIdle(undefined, "/signin")).toBe(false);
  });

  it("still signs out a foreground idle response that started inside the app", () => {
    expect(shouldHandleServerSessionIdle(undefined, "/app/dashboard")).toBe(true);
  });

  it("does not sign out background polls", () => {
    expect(shouldHandleServerSessionIdle({ background: true }, "/app/dashboard")).toBe(false);
  });
});

describe("mountActivityBase", () => {
  it("starts a fresh timer when the stored stamp is already past the idle window", () => {
    const now = 1_700_000_000_000;
    const stored = now - IDLE_LOGOUT_MS - 1;
    const decision = mountActivityBase(now, stored, IDLE_LOGOUT_MS);
    expect(decision.replaceStored).toBe(true);
    expect(decision.baseMs).toBe(now);
    expect(now - decision.baseMs).toBeLessThan(IDLE_LOGOUT_MS);
  });

  it("keeps a recent stamp", () => {
    const now = 1_700_000_000_000;
    const stored = now - 60_000;
    expect(mountActivityBase(now, stored, IDLE_LOGOUT_MS)).toEqual({
      baseMs: stored,
      replaceStored: false,
    });
  });
});
