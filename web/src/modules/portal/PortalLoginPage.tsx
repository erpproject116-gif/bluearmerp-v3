import { createSignal, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import {
  fetchPortalSession,
  getPortalToken,
  requestPortalMagicLink,
  setPortalToken,
} from "../../shared/portal-api";

export default function PortalLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [linkUrl, setLinkUrl] = createSignal<string | null>(null);

  const existing = getPortalToken();
  if (existing) {
    void fetchPortalSession(existing).then((res) => {
      if (res.ok) navigate("/portal/dashboard", { replace: true });
    });
  }

  const submit = async (e: Event) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setLinkUrl(null);
    const res = await requestPortalMagicLink(email().trim());
    setLoading(false);
    if (!res.ok) {
      setError(res.message ?? "Could not request sign-in link.");
      return;
    }
    const url = res.data?.login_url;
    const token = res.data?.token;
    if (token) {
      setPortalToken(token);
      navigate("/portal/dashboard", { replace: true });
      return;
    }
    if (url) setLinkUrl(url);
  };

  return (
    <div class="flex min-h-screen items-center justify-center bg-surface px-4">
      <div class="w-full max-w-md rounded-xl border border-stroke bg-white p-8 shadow-sm">
        <h1 class="text-xl font-semibold text-text-primary">Customer Portal</h1>
        <p class="mt-2 text-sm text-text-secondary">
          Enter your email to receive a magic sign-in link.
        </p>

        <form class="mt-6 space-y-4" onSubmit={submit}>
          <div>
            <label class="mb-1 block text-sm font-medium text-text-primary" for="portal-email">
              Email
            </label>
            <input
              id="portal-email"
              type="email"
              required
              class="w-full rounded-lg border border-stroke px-3 py-2 text-sm"
              value={email()}
              onInput={(e) => setEmail(e.currentTarget.value)}
            />
          </div>
          <button
            type="submit"
            disabled={loading()}
            class="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {loading() ? "Sending…" : "Send sign-in link"}
          </button>
        </form>

        <Show when={error()}>
          <p class="mt-4 text-sm text-red-600">{error()}</p>
        </Show>

        <Show when={linkUrl()}>
          <p class="mt-4 text-sm text-text-secondary">
            Sign-in link (dev stub):{" "}
            <a class="text-brand-600 hover:underline" href={linkUrl()!}>
              Open portal
            </a>
          </p>
        </Show>
      </div>
    </div>
  );
}
