import { describe, expect, it } from "vitest";
import { ONBOARDING_PLAYBOOK_WEEKS, resolvePlaybookStep, resolvePlaybookWeek } from "./onboardingPlaybookData";
import type { OnboardingTrack } from "../../shared/usePlatform";

const sampleTracks: OnboardingTrack[] = [
  {
    id: "manufacturing",
    title: "Production & recipe",
    description: "",
    percent: 50,
    steps: [
      { id: "mfg_hub", label: "Hub", href: "/app/production", done: true },
      { id: "recipe_bom", label: "Recipe", href: "/app/production/recipe/recipes", done: false },
      { id: "recipe_job", label: "Job", href: "/app/production/orders/new?type=recipe", done: false },
      { id: "recipe_post", label: "Post", href: "/app/production/recipe/jobs", done: false },
    ],
  },
];

describe("resolvePlaybookStep", () => {
  it("uses setup-readiness for foundation steps", () => {
    const row = resolvePlaybookStep(
      ONBOARDING_PLAYBOOK_WEEKS[0]!.steps[0]!,
      [],
      {
        percent: 10,
        ready: false,
        required_complete: false,
        steps: [{ id: "company", label: "Co", href: "/app/settings/branding", done: true, required: true }],
      },
    );
    expect(row?.done).toBe(true);
    expect(row?.href).toContain("branding");
  });

  it("uses track step done flag for manufacturing", () => {
    const def = ONBOARDING_PLAYBOOK_WEEKS[2]!.steps[0]!;
    const row = resolvePlaybookStep(def, sampleTracks, undefined);
    expect(row?.done).toBe(true);
    expect(row?.href).toBe("/app/production");
  });

  it("returns null when track step is missing (module off)", () => {
    const def = ONBOARDING_PLAYBOOK_WEEKS[2]!.steps[0]!;
    expect(resolvePlaybookStep(def, [], undefined)).toBeNull();
  });
});

describe("resolvePlaybookWeek", () => {
  it("filters missing track steps", () => {
    const week = ONBOARDING_PLAYBOOK_WEEKS[2]!;
    const rows = resolvePlaybookWeek(week, sampleTracks, undefined);
    expect(rows).toHaveLength(4);
    expect(rows[1]?.href).toBe("/app/production/recipe/recipes");
  });
});
