import { createSignal, For, onMount, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { apiFetch, supabase, supabaseConfigured } from "../../shared/api";
import { setActiveTenantId } from "../../shared/activeContext";
import { useAuth } from "../../shared/auth-context";

type DemoTemplate = {
  industry_code: string;
  label: string;
  description: string;
};

type Step = "form" | "verify" | "provisioning";

export default function DemoSignupPage() {
  const navigate = useNavigate();
  const auth = useAuth();

  const [templates, setTemplates] = createSignal<DemoTemplate[]>([]);
  const [step, setStep] = createSignal<Step>("form");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [info, setInfo] = createSignal<string | null>(null);

  const [fullName, setFullName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [mobile, setMobile] = createSignal("");
  const [company, setCompany] = createSignal("");
  const [industry, setIndustry] = createSignal("");
  const [code, setCode] = createSignal("");

  onMount(async () => {
    const res = await apiFetch<{ templates: DemoTemplate[] }>("/api/v1/demo/templates", {}, { silent: true });
    if (res.success && res.data?.templates?.length) {
      setTemplates(res.data.templates);
      setIndustry(res.data.templates[0].industry_code);
    }
  });

  const submitForm = async (e: Event) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!supabaseConfigured) {
      setError("Sign-up is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      return;
    }
    setLoading(true);
    const res = await apiFetch<{ signup_id: number; email: string }>(
      "/api/v1/demo/signup",
      {
        method: "POST",
        body: JSON.stringify({
          full_name: fullName().trim(),
          email: email().trim(),
          mobile: mobile().trim(),
          company_name: company().trim(),
          industry_code: industry(),
        }),
      },
      { silent: true },
    );
    if (!res.success) {
      setLoading(false);
      const firstFieldError = res.errors ? Object.values(res.errors)[0] : null;
      setError(firstFieldError ?? res.message ?? "Could not start the demo. Please try again.");
      return;
    }

    const { error: otpErr } = await supabase.auth.signInWithOtp({
      email: email().trim(),
      options: { shouldCreateUser: true },
    });
    setLoading(false);
    if (otpErr) {
      setError(otpErr.message);
      return;
    }
    setInfo(`We emailed a 6-digit code to ${email().trim()}. Enter it below to start your demo.`);
    setStep("verify");
  };

  const verifyCode = async (e: Event) => {
    e.preventDefault();
    setError(null);
    const token = code().trim();
    if (token.length < 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setLoading(true);
    const { error: verifyErr } = await supabase.auth.verifyOtp({
      email: email().trim(),
      token,
      type: "email",
    });
    if (verifyErr) {
      setLoading(false);
      setError(verifyErr.message);
      return;
    }

    // Session established — provision the isolated demo workspace, then enter it.
    setStep("provisioning");
    const res = await apiFetch<{ tenant_id: number; company_code: string }>(
      "/api/v1/demo/provision",
      { method: "POST", body: "{}" },
      { silent: true },
    );
    if (!res.success || !res.data?.tenant_id) {
      setLoading(false);
      setStep("verify");
      setError(res.message ?? "Could not provision your demo workspace. Please try again.");
      return;
    }
    setActiveTenantId(res.data.tenant_id);
    await auth.refresh();
    navigate("/app/inventory/partners", { replace: true });
  };

  const resendCode = async () => {
    setError(null);
    setInfo(null);
    setLoading(true);
    const { error: otpErr } = await supabase.auth.signInWithOtp({
      email: email().trim(),
      options: { shouldCreateUser: true },
    });
    setLoading(false);
    if (otpErr) {
      setError(otpErr.message);
      return;
    }
    setInfo("A new code is on its way.");
  };

  return (
    <div class="flex min-h-screen bg-body">
      <div class="hidden w-1/2 flex-col justify-between bg-brand-600 p-12 text-white lg:flex">
        <div class="flex items-center gap-3">
          <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 text-xl font-bold">B</div>
          <span class="text-2xl font-semibold">BluearmERP</span>
        </div>
        <div>
          <h2 class="text-3xl font-semibold leading-tight">Try a fully-loaded demo</h2>
          <p class="mt-4 max-w-md text-brand-100">
            Your own isolated workspace, pre-filled with realistic sample data across quotations,
            inventory, sales, purchasing, finance, and CRM. No credit card. Nothing touches other accounts.
          </p>
        </div>
        <p class="text-sm text-brand-100">© Bluearm Philippines</p>
      </div>

      <div class="flex w-full flex-col justify-center px-6 py-12 lg:w-1/2 lg:px-16">
        <div class="mx-auto w-full max-w-md">
          <h1 class="text-2xl font-semibold text-text-primary">
            <Show when={step() === "form"} fallback="Verify your email">
              Start your free demo
            </Show>
          </h1>
          <p class="mt-2 text-sm text-text-secondary">
            <Show
              when={step() === "form"}
              fallback="Enter the code we sent so we can build your sample workspace."
            >
              Tell us a bit about you — we'll spin up a sample workspace instantly.
            </Show>
          </p>

          <Show when={step() === "form"}>
            <form class="mt-8 space-y-4" onSubmit={(e) => void submitForm(e)}>
              <div>
                <label class="mb-1 block text-sm font-medium text-text-primary">Full name</label>
                <input
                  type="text"
                  required
                  value={fullName()}
                  onInput={(e) => setFullName(e.currentTarget.value)}
                  class="w-full rounded-lg border border-stroke bg-white px-3 py-2.5 text-sm text-text-primary outline-none focus:border-brand-500"
                  placeholder="Juan dela Cruz"
                />
              </div>
              <div>
                <label class="mb-1 block text-sm font-medium text-text-primary">Work email</label>
                <input
                  type="email"
                  required
                  value={email()}
                  onInput={(e) => setEmail(e.currentTarget.value)}
                  class="w-full rounded-lg border border-stroke bg-white px-3 py-2.5 text-sm text-text-primary outline-none focus:border-brand-500"
                  placeholder="you@company.com"
                />
              </div>
              <div>
                <label class="mb-1 block text-sm font-medium text-text-primary">Mobile number</label>
                <input
                  type="tel"
                  required
                  value={mobile()}
                  onInput={(e) => setMobile(e.currentTarget.value)}
                  class="w-full rounded-lg border border-stroke bg-white px-3 py-2.5 text-sm text-text-primary outline-none focus:border-brand-500"
                  placeholder="0917 123 4567"
                />
                <p class="mt-1 text-xs text-text-secondary">Philippine mobile (+63).</p>
              </div>
              <div>
                <label class="mb-1 block text-sm font-medium text-text-primary">
                  Company <span class="text-text-secondary">(optional)</span>
                </label>
                <input
                  type="text"
                  value={company()}
                  onInput={(e) => setCompany(e.currentTarget.value)}
                  class="w-full rounded-lg border border-stroke bg-white px-3 py-2.5 text-sm text-text-primary outline-none focus:border-brand-500"
                  placeholder="Acme Trading Inc."
                />
              </div>
              <div>
                <label class="mb-1 block text-sm font-medium text-text-primary">Industry</label>
                <select
                  required
                  value={industry()}
                  onChange={(e) => setIndustry(e.currentTarget.value)}
                  class="w-full rounded-lg border border-stroke bg-white px-3 py-2.5 text-sm text-text-primary outline-none focus:border-brand-500"
                >
                  <For each={templates()}>
                    {(t) => <option value={t.industry_code}>{t.label}</option>}
                  </For>
                </select>
                <Show when={templates().find((t) => t.industry_code === industry())}>
                  {(t) => <p class="mt-1 text-xs text-text-secondary">{t().description}</p>}
                </Show>
              </div>

              <button
                type="submit"
                disabled={loading()}
                class="w-full rounded-lg bg-brand-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
              >
                {loading() ? "Sending code…" : "Send verification code"}
              </button>
            </form>
          </Show>

          <Show when={step() === "verify"}>
            <form class="mt-8 space-y-4" onSubmit={(e) => void verifyCode(e)}>
              <div>
                <label class="mb-1 block text-sm font-medium text-text-primary">6-digit code</label>
                <input
                  type="text"
                  inputmode="numeric"
                  autocomplete="one-time-code"
                  maxLength={6}
                  value={code()}
                  onInput={(e) => setCode(e.currentTarget.value.replace(/\D/g, ""))}
                  class="w-full rounded-lg border border-stroke bg-white px-3 py-2.5 text-center text-lg tracking-[0.5em] text-text-primary outline-none focus:border-brand-500"
                  placeholder="••••••"
                />
              </div>
              <button
                type="submit"
                disabled={loading()}
                class="w-full rounded-lg bg-brand-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
              >
                {loading() ? "Verifying…" : "Verify & start demo"}
              </button>
              <div class="flex items-center justify-between text-xs text-text-secondary">
                <button type="button" class="hover:text-brand-600" onClick={() => setStep("form")}>
                  ← Change details
                </button>
                <button type="button" class="hover:text-brand-600" onClick={() => void resendCode()}>
                  Resend code
                </button>
              </div>
            </form>
          </Show>

          <Show when={step() === "provisioning"}>
            <div class="mt-10 flex flex-col items-center text-center">
              <div class="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
              <p class="text-sm text-text-secondary">Building your demo workspace and loading sample data…</p>
            </div>
          </Show>

          <Show when={error()}>
            <p class="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error()}</p>
          </Show>
          <Show when={info() && !error()}>
            <p class="mt-4 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-700">{info()}</p>
          </Show>

          <p class="mt-8 text-xs text-text-secondary">
            Already have an account?{" "}
            <button type="button" class="font-medium text-brand-600 hover:underline" onClick={() => navigate("/signin")}>
              Sign in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
