import { type ParentComponent, Show, createSignal, onMount } from "solid-js";
import { Navigate, useNavigate } from "@solidjs/router";
import { supabase, apiNetworkErrorMessage } from "../shared/api";
import { useAuth } from "../shared/auth-context";
import { needsSignInRedirect, SessionLoading } from "./AuthRedirect";
import { signOutApp } from "./signOut";

export const ProtectedRoute: ParentComponent = (props) => {
  const auth = useAuth();
  const navigate = useNavigate();
  const [signedInAs, setSignedInAs] = createSignal("");

  onMount(() => {
    void supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (user?.email) {
        setSignedInAs(user.id ? `${user.email} · ${user.id}` : user.email);
      }
    });
  });

  const signOut = async () => {
    await signOutApp("logout");
    navigate("/signin", { replace: true });
  };

  return (
    <Show when={auth.bootstrapping} fallback={
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
                        <p class="mt-2 text-sm text-text-secondary">{apiNetworkErrorMessage()}</p>
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
                    Your sign-in worked, but this email is not linked to a company workspace yet. You can:
                  </p>
                  <ul class="mt-3 list-inside list-disc space-y-1 text-sm text-text-secondary">
                    <li>
                      <a href="/welcome" class="font-medium text-brand-600 hover:underline">
                        Start a 30-day free trial
                      </a>{" "}
                      (empty workspace for real data)
                    </li>
                    <li>
                      <a href="/demo" class="font-medium text-brand-600 hover:underline">
                        Start a free demo
                      </a>{" "}
                      (sample data, ~14 days)
                    </li>
                    <li>Ask your administrator to invite you, then sign in again with the same email</li>
                  </ul>
                  {auth.bootstrapMessage && (
                    <p class="mt-2 text-xs text-text-secondary">{auth.bootstrapMessage}</p>
                  )}
                  {signedInAs() && (
                    <p class="mt-3 rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-text-secondary">
                      Signed in as: {signedInAs()}
                    </p>
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
