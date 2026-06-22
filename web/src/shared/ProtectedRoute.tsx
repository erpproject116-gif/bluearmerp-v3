import { type ParentComponent, Show } from "solid-js";
import { Navigate, useNavigate } from "@solidjs/router";
import { supabase } from "../shared/api";
import { useAuth } from "../shared/auth-context";
import { needsSignInRedirect, SessionLoading } from "./AuthRedirect";

export const ProtectedRoute: ParentComponent = (props) => {
  const auth = useAuth();
  const navigate = useNavigate();

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/signin", { replace: true });
  };

  return (
    <Show when={auth.loading} fallback={
      <Show
        when={auth.me}
        fallback={
          <Show when={needsSignInRedirect(auth)} fallback={
            <Show
              when={auth.bootstrapError === "forbidden"}
              fallback={
                <div class="flex min-h-screen items-center justify-center bg-body p-6">
                  <div class="max-w-lg rounded-xl border border-stroke bg-white p-6 shadow-sm">
                    <p class="text-sm font-medium text-text-primary">Cannot reach the API</p>
                    <p class="mt-2 text-sm text-text-secondary">
                      Check that the Go API is running and{" "}
                      <code class="text-brand-600">VITE_API_BASE_URL</code> points to it in production.
                    </p>
                    {auth.bootstrapMessage && (
                      <p class="mt-2 text-xs text-text-secondary">{auth.bootstrapMessage}</p>
                    )}
                    <div class="mt-5">
                      <button
                        type="button"
                        class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
                        onClick={() => void auth.refresh()}
                      >
                        Retry
                      </button>
                    </div>
                  </div>
                </div>
              }
            >
              <div class="flex min-h-screen items-center justify-center bg-body p-6">
                <div class="max-w-lg rounded-xl border border-stroke bg-white p-6 shadow-sm">
                  <p class="text-sm font-medium text-text-primary">Account not provisioned yet</p>
                  <p class="mt-2 text-sm text-text-secondary">
                    Your Google sign-in worked, but this email is not linked to a tenant user. Ask a tenant
                    administrator to invite you from <strong>User Management → Users</strong>, then sign in again
                    with the same Gmail address.
                  </p>
                  {auth.bootstrapMessage && (
                    <p class="mt-2 text-xs text-text-secondary">{auth.bootstrapMessage}</p>
                  )}
                  <div class="mt-5 flex gap-2">
                    <button
                      type="button"
                      class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
                      onClick={() => void auth.refresh()}
                    >
                      Retry
                    </button>
                    <button
                      type="button"
                      class="rounded-lg border border-stroke px-4 py-2 text-sm text-text-secondary hover:bg-slate-50"
                      onClick={() => void signOut()}
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              </div>
            </Show>
          }>
            <Navigate href="/signin" />
          </Show>
        }
      >
        {props.children}
      </Show>
    }>
      <SessionLoading />
    </Show>
  );
};
