import { Show, createEffect, type ParentComponent } from "solid-js";
import { Navigate, useNavigate } from "@solidjs/router";
import { useAuth } from "./auth-context";
import { resolveAppEntryPath } from "./resolveAppEntryPath";

export function needsSignInRedirect(auth: {
  bootstrapping: boolean;
  me: unknown;
  bootstrapError: string | null;
}): boolean {
  if (auth.bootstrapping || auth.me) return false;
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

/** Sends `/` (and unknown paths) to sign-in or the best app home for this user. */
export function AuthEntryRedirect() {
  const auth = useAuth();
  const navigate = useNavigate();

  createEffect(() => {
    if (auth.bootstrapping) return;
    if (!auth.me) return;
    void resolveAppEntryPath(auth.me).then((href) => navigate(href, { replace: true }));
  });

  return (
    <Show when={!auth.bootstrapping} fallback={<SessionLoading />}>
      <Show when={!auth.me} fallback={<SessionLoading />}>
        <Navigate href="/signin" />
      </Show>
    </Show>
  );
}
