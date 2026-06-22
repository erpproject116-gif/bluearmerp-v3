import { Show, type ParentComponent } from "solid-js";
import { Navigate } from "@solidjs/router";
import { useAuth } from "./auth-context";

export function needsSignInRedirect(auth: {
  loading: boolean;
  me: unknown;
  bootstrapError: string | null;
}): boolean {
  if (auth.loading || auth.me) return false;
  if (auth.bootstrapError === "forbidden" || auth.bootstrapError === "network") return false;
  return true;
}

export const SessionLoading: ParentComponent = () => (
  <div class="flex min-h-screen items-center justify-center bg-body p-6">
    <div class="text-center">
      <div class="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      <p class="text-sm text-text-secondary">Loading session…</p>
    </div>
  </div>
);

/** Sends `/` (and unknown paths) to sign-in or the default app home. */
export function AuthEntryRedirect() {
  const auth = useAuth();
  return (
    <Show when={!auth.loading} fallback={<SessionLoading />}>
      <Navigate href={auth.me ? "/app/inventory/partners" : "/signin"} />
    </Show>
  );
}
