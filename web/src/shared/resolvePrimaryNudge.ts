import type { MeData } from "./auth-context";
import { canManageWorkspaceSetup } from "./resolveAppEntryPath";
import type { SetupReadiness } from "./usePlatform";

export type PrimaryNudgeKind = "setup" | "commercial" | "playbook" | "none";

export type OnboardingNudgeData = {
  show_setup_checklist?: boolean;
  show_playbook?: boolean;
  required_complete?: boolean;
};

export type ResolvePrimaryNudgeInput = {
  me: MeData | null | undefined;
  setup: SetupReadiness | null | undefined;
  onboarding: OnboardingNudgeData | null | undefined;
  pathname: string;
};

function canManageCommercial(me: MeData | null | undefined): boolean {
  return canManageWorkspaceSetup(me);
}

function isCommercialLocked(me: MeData | null | undefined): boolean {
  if (!me?.commercial?.status || me.commercial.status === "unlocked") return false;
  if (me.tenant?.is_demo) return false;
  return true;
}

/**
 * Returns at most one primary nudge surface: setup banner, commercial banner, or playbook panel.
 * Priority: foundation setup → commercial gate → onboarding playbook → none.
 */
export function resolvePrimaryNudge(input: ResolvePrimaryNudgeInput): PrimaryNudgeKind {
  const { me, setup, onboarding, pathname } = input;
  if (!me || !pathname.startsWith("/app")) return "none";
  if (
    pathname.startsWith("/app/setup") ||
    pathname.startsWith("/app/onboarding") ||
    pathname.startsWith("/app/dashboard/onboarding")
  ) {
    return "none";
  }

  const foundationIncomplete = setup != null && !setup.required_complete;

  if (foundationIncomplete) {
    if (
      setup.show_setup_banner ||
      setup.show_breadcrumb_hint ||
      onboarding?.show_setup_checklist ||
      !canManageWorkspaceSetup(me)
    ) {
      return "setup";
    }
  }

  if (
    canManageCommercial(me) &&
    setup?.required_complete &&
    isCommercialLocked(me)
  ) {
    return "commercial";
  }

  if (onboarding?.show_playbook && !onboarding?.show_setup_checklist) {
    return "playbook";
  }

  if (onboarding?.show_playbook && foundationIncomplete && !setup?.show_setup_banner) {
    return "playbook";
  }

  return "none";
}

export function usePrimaryNudgeKind(
  me: MeData | null | undefined,
  setup: SetupReadiness | null | undefined,
  onboarding: OnboardingNudgeData | null | undefined,
  pathname: string,
): PrimaryNudgeKind {
  return resolvePrimaryNudge({ me, setup, onboarding, pathname });
}
