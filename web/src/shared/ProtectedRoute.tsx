import { type ParentComponent, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { supabase } from "../shared/api";
import { useAuth } from "../shared/auth-context";

export const ProtectedRoute: ParentComponent = (props) => {
  const auth = useAuth();
  const navigate = useNavigate();

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/signin", { replace: true });
  };

  return (
    <Show
      when={!auth.loading && auth.me}
      fallback={
        <div class="flex min-h-screen items-center justify-center bg-body p-6">
          <div class="max-w-lg rounded-xl border border-stroke bg-white p-6 shadow-sm">
            <Show
              when={!auth.loading}
              fallback={
                <div class="text-center">
                  <div class="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
                  <p class="text-sm text-text-secondary">Loading session…</p>
                </div>
              }
            >
              <Show
                when={auth.bootstrapError === "forbidden"}
                fallback={
                  <Show
                    when={auth.bootstrapError === "unauthorized"}
                    fallback={
                      <div>
                        <p class="text-sm font-medium text-text-primary">Cannot reach the API</p>
                        <p class="mt-2 text-sm text-text-secondary">
                          Start the Go server:{" "}
                          <code class="text-brand-600">cd api && go run ./cmd/server</code>
                        </p>
                        {auth.bootstrapMessage && (
                          <p class="mt-2 text-xs text-text-secondary">{auth.bootstrapMessage}</p>
                        )}
                      </div>
                    }
                  >
                    <p class="text-sm font-medium text-text-primary">Invalid session token</p>
                <p class="mt-2 text-sm text-text-secondary">
                  The API validates Supabase tokens via JWKS (ES256). Ensure{" "}
                  <code class="text-brand-600">SUPABASE_URL</code> is set in <code class="text-brand-600">web/.env.local</code>{" "}
                  and restart the Go API after env changes.
                </p>
                  </Show>
                }
              >
                <p class="text-sm font-medium text-text-primary">Google sign-in succeeded — account not linked yet</p>
                <p class="mt-2 text-sm text-text-secondary">
                  Your Gmail has a Supabase session, but there is no matching row in{" "}
                  <code class="text-brand-600">public.users</code> yet.
                </p>
                <ol class="mt-4 list-decimal space-y-2 pl-5 text-sm text-text-secondary">
                  <li>
                    In Supabase Dashboard → <strong>SQL Editor</strong>, run{" "}
                    <code class="text-brand-600">scripts/link-platform-owners.sql</code>
                  </li>
                  <li>Re-run after you have signed in with Google at least once (creates auth.users)</li>
                  <li>Click retry below</li>
                </ol>
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
              </Show>
            </Show>
          </div>
        </div>
      }
    >
      {props.children}
    </Show>
  );
};
