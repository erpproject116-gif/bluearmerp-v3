import { Navigate } from "@solidjs/router";

/** Legacy route — onboarding lives on Home → Onboarding tab. */
export default function OnboardingPage() {
  return <Navigate href="/app/dashboard/onboarding" />;
}
