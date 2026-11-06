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
  const [tokenInput, setTokenInput] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [linkUrl, setLinkUrl] = createSignal<string | null>(null);

  const goPortal = (token: string) => {
    setPortalToken(token);
    navigate(`/app/hr/client-portal?token=${encodeURIComponent(token)}`, { replace: true });
  };

  const existing = getPortalToken();
  if (existing) {
    void fetchPortalSession(existing)
      .then((res) => {
        if (res.ok) navigate("/app/hr/client-portal", { replace: true });
      })
      .catch(() => {
        /* stay on login */
      });
  }

  const submit = async (e: Event) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setLinkUrl(null);
    try {
      const res = await requestPortalMagicLink(email().trim());
      if (!res.ok) {
        setError(res.message ?? "Could not request sign-in link.");
        return;
      }
      const url = res.data?.login_url;
      const token = res.data?.token;
      if (token) {
        goPortal(token);
        return;
      }
      if (url) {
        setLinkUrl(url);
        return;
      }
      // Privacy-preserving empty success (unknown email) — give staff a clear next step.
      setError(
        "No active portal user for that email. Client reps need an invite from HR → Portal access. Owners can also use Preview portal there — or load Sample HR data and paste the sample portal token below.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  };

  const submitToken = async (e: Event) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const token = tokenInput().trim();
      if (!token) {
        setError("Paste a portal token from Sample HR (e.g. samplehr12) or a magic link.");
        return;
      }
      const res = await fetchPortalSession(token);
      if (!res.ok) {
        setError(res.message ?? "Invalid or expired portal token.");
        return;
      }
      goPortal(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
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

        <div class="my-6 border-t border-stroke" />

        <p class="text-sm text-text-secondary">
          Have a Sample HR portal token? Paste it here (from HR Overview → Sample HR paste card).
        </p>
        <form class="mt-3 space-y-3" onSubmit={submitToken}>
          <div>
            <label class="mb-1 block text-sm font-medium text-text-primary" for="portal-token">
              Portal token
            </label>
            <input
              id="portal-token"
              type="text"
              autocomplete="off"
              placeholder="samplehr…"
              class="w-full rounded-lg border border-stroke px-3 py-2 text-sm font-mono"
              value={tokenInput()}
              onInput={(e) => setTokenInput(e.currentTarget.value)}
            />
          </div>
          <button
            type="submit"
            disabled={loading()}
            class="w-full rounded-lg border border-stroke bg-white px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface disabled:opacity-60"
          >
            Open portal with token
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
