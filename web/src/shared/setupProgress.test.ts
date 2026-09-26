import { describe, expect, it } from "vitest";
import { resolveGettingStarted, wizardFoundationPercent } from "./setupProgress";

describe("resolveGettingStarted", () => {
  it("stays visible until first sale and bank are done", () => {
    const got = resolveGettingStarted({
      percent: 100,
      ready: true,
      required_complete: true,
      steps: [
        { id: "company", label: "c", href: "/x", done: true, required: true },
        { id: "chart_of_accounts", label: "c", href: "/x", done: true, required: true },
        { id: "currency_tax", label: "c", href: "/x", done: true, required: true },
        { id: "process_policies", label: "c", href: "/x", done: true, required: true },
        { id: "location", label: "c", href: "/x", done: true, required: true },
        { id: "partners", label: "c", href: "/x", done: true, required: true },
        { id: "items", label: "c", href: "/x", done: true, required: true },
        { id: "team", label: "c", href: "/x", done: false, required: false },
        { id: "first_sale", label: "c", href: "/x", done: false, required: false },
        { id: "bank", label: "c", href: "/x", done: true, required: false },
        { id: "ready", label: "c", href: "/x", done: true, required: false },
      ],
    });
    expect(got.visible).toBe(true);
    expect(got.next?.id).toBe("first_sale");
  });

  it("hides when required plus first sale and bank are done", () => {
    const got = resolveGettingStarted({
      percent: 100,
      ready: true,
      required_complete: true,
      steps: [
        { id: "company", label: "c", href: "/x", done: true, required: true },
        { id: "chart_of_accounts", label: "c", href: "/x", done: true, required: true },
        { id: "currency_tax", label: "c", href: "/x", done: true, required: true },
        { id: "process_policies", label: "c", href: "/x", done: true, required: true },
        { id: "location", label: "c", href: "/x", done: true, required: true },
        { id: "partners", label: "c", href: "/x", done: true, required: true },
        { id: "items", label: "c", href: "/x", done: true, required: true },
        { id: "first_sale", label: "c", href: "/x", done: true, required: false },
        { id: "bank", label: "c", href: "/x", done: true, required: false },
      ],
    });
    expect(got.visible).toBe(false);
  });

  it("wizard percent ignores first sale and bank", () => {
    const percent = wizardFoundationPercent({
      percent: 50,
      ready: true,
      required_complete: true,
      steps: [
        { id: "company", label: "c", href: "/x", done: true, required: true },
        { id: "chart_of_accounts", label: "c", href: "/x", done: true, required: true },
        { id: "currency_tax", label: "c", href: "/x", done: true, required: true },
        { id: "process_policies", label: "c", href: "/x", done: true, required: true },
        { id: "location", label: "c", href: "/x", done: true, required: true },
        { id: "partners", label: "c", href: "/x", done: true, required: true },
        { id: "items", label: "c", href: "/x", done: true, required: true },
        { id: "team", label: "c", href: "/x", done: true, required: false },
        { id: "first_sale", label: "c", href: "/x", done: false, required: false },
        { id: "bank", label: "c", href: "/x", done: false, required: false },
        { id: "ready", label: "c", href: "/x", done: true, required: false },
      ],
    });
    expect(percent).toBe(100);
  });

  it("reaches 100% without inviting the team", () => {
    const percent = wizardFoundationPercent({
      percent: 88,
      ready: true,
      required_complete: true,
      steps: [
        { id: "company", label: "c", href: "/x", done: true, required: true },
        { id: "chart_of_accounts", label: "c", href: "/x", done: true, required: true },
        { id: "currency_tax", label: "c", href: "/x", done: true, required: true },
        { id: "process_policies", label: "c", href: "/x", done: true, required: true },
        { id: "location", label: "c", href: "/x", done: true, required: true },
        { id: "partners", label: "c", href: "/x", done: true, required: true },
        { id: "items", label: "c", href: "/x", done: true, required: true },
        { id: "team", label: "c", href: "/x", done: false, required: false },
        { id: "ready", label: "c", href: "/x", done: true, required: false },
      ],
    });
    expect(percent).toBe(100);
  });
});
