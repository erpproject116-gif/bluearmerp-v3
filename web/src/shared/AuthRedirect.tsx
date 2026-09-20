import { Show, createEffect, type ParentComponent } from "solid-js";
import { Navigate, useLocation, useNavigate } from "@solidjs/router";
import { useAuth } from "./auth-context";
import { DEFAULT_BRAND_LOGO_URL } from "./branding/defaults";
import { buildSignInHref, captureReturnTo, resolvePostLoginPath } from "./authReturnTo";

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
      <img
        src={DEFAULT_BRAND_LOGO_URL}
        alt=""
        class="mx-auto mb-4 h-14 w-14 object-contain"
        width="56"
        height="56"
      />
      <p class="text-sm text-text-secondary">Loading session…</p>
    </div>
  </div>
);

/** Capture current app URL then send the user to /signin (session missing). */
export function NavigateToSignIn() {
  const loc = useLocation();
  const path = `${loc.pathname}${loc.search}${loc.hash || ""}`;
  captureReturnTo(path);
  return <Navigate href={buildSignInHref({ next: path })} />;
}

/** Sends `/` (and unknown paths) to sign-in or the best app home for this user. */
export function AuthEntryRedirect() {
  const auth = useAuth();
  const navigate = useNavigate();

  createEffect(() => {
    if (auth.bootstrapping) return;
    if (!auth.me) return;
    void resolvePostLoginPath(auth.me).then((href) => navigate(href, { replace: true }));
  });

  return (
    <Show when={!auth.bootstrapping} fallback={<SessionLoading />}>
      <Show when={!auth.me} fallback={<SessionLoading />}>
        <Navigate href="/signin" />
      </Show>
    </Show>
  );
}
