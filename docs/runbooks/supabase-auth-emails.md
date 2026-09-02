# Supabase Auth emails (BluearmERP)

Versioned HTML for **Supabase Auth** mail only. Source of truth:

| File | Dashboard template | Subject |
|------|--------------------|---------|
| [`supabase/templates/confirmation.html`](../../supabase/templates/confirmation.html) | Confirm signup | Confirm your BluearmERP account |
| [`supabase/templates/recovery.html`](../../supabase/templates/recovery.html) | Reset password | Reset your BluearmERP password |
| [`supabase/templates/magic_link.html`](../../supabase/templates/magic_link.html) | Magic Link | Your BluearmERP demo code |

Local CLI loads these via [`supabase/config.toml`](../../supabase/config.toml) (`auth.email.template.*`). Hosted projects use the Dashboard (or Management API) — paste the **same** HTML.

Do **not** customize the Supabase **Invite user** template for company invites. Those are sent by the Go API outbox, not Auth.

Official variable reference: [Auth email templates](https://supabase.com/docs/guides/auth/auth-email-templates).

---

## Mail path map

| Flow | Who sends | App entry | Landing |
|------|-----------|-----------|---------|
| Email signup confirmation | Supabase Auth | `SignUpPage` → `signUp` + `emailRedirectTo` `/auth/callback` | `/auth/callback` |
| Forgot / reset password | Supabase Auth | `ForgotPasswordPage` → `resetPasswordForEmail` → `/auth/reset-password` | `/auth/reset-password` |
| Demo OTP | Supabase Auth | `DemoSignupPage` → `signInWithOtp` + `verifyOtp({ type: "email" })` | Enter **6-digit code** in UI (`{{ .Token }}` required in template) |
| Company / teammate invite | **API outbox** (`RESEND_*` or `SMTP_*` on ECS) | User Management → Invites | Sign in with Google (same email) — **not** this runbook |

---

## Auth SMTP vs API SMTP

| System | Used for | Configure where |
|--------|----------|-----------------|
| **Supabase Auth SMTP** | Confirm signup, reset password, magic link / OTP | Dashboard → Authentication → SMTP (or default Supabase mail for tests) |
| **API mail** (`RESEND_API_KEY` + `RESEND_FROM`/`SMTP_FROM`, or `SMTP_*`) | Company invites, document email, digests | ECS API env — see [`ops-email-notifications.md`](./ops-email-notifications.md). Prefer Resend HTTPS (`RESEND_API_KEY`). |

Changing Auth templates or Auth SMTP does **not** change invite or Communications mail.

For production Auth mail: use a verified domain, From display name **BluearmERP**, and **disable link/open tracking** on the provider. Tracking that rewrites URLs breaks Supabase verify links ([documented limitation](https://supabase.com/docs/guides/auth/auth-email-templates#email-tracking)).

---

## URL Configuration (required)

For **each** environment (local, staging, production), set Authentication → URL Configuration:

| Field | Value |
|-------|--------|
| Site URL | That env’s web origin (e.g. `http://localhost:5173` or `https://YOUR-APP.vercel.app`) |
| Redirect URLs | `{origin}/auth/callback` **and** `{origin}/auth/reset-password` |

Local defaults are already in `supabase/config.toml` `additional_redirect_urls`.

Missing `/auth/reset-password` causes forgot-password emails to fail after click even when the template looks correct.

---

## Confirm email setting (do not flip in this pass)

| Environment | Setting | Behavior |
|-------------|---------|----------|
| Local | `enable_confirmations = false` in `config.toml` | Signup may not send confirm mail; session path in `SignUpPage` still works |
| Hosted | Dashboard → Authentication → Providers → Email → **Confirm email** | **Read and record** the current value. Do **not** toggle without a measured before/after test |

- If confirmations **ON**: Confirm signup template is live; users get “check your email”.
- If confirmations **OFF**: no confirm mail expected; keep the template in git/Dashboard for when you enable it later.

---

## Local apply

After editing HTML under `supabase/templates/`:

```bash
# From bluearmerp-v3/
supabase stop
supabase start
```

Inbasket for local Auth mail: [Supabase local email testing](https://supabase.com/docs/guides/local-development/testing-emails) (Mailpit / Inbucket depending on CLI version).

---

## Hosted apply (Dashboard)

1. Open **Authentication → URL Configuration** — add callback + reset-password for every real origin.
2. Open **Authentication → SMTP** — configure production Auth SMTP (or leave default only for throwaway tests). Disable click tracking on the provider.
3. Open **Authentication → Email Templates**.
4. For each row below, set **Subject** and paste body HTML from the repo file (full file contents):

   | Dashboard name | Subject | Paste from |
   |----------------|---------|------------|
   | Confirm signup | Confirm your BluearmERP account | `supabase/templates/confirmation.html` |
   | Reset password | Reset your BluearmERP password | `supabase/templates/recovery.html` |
   | Magic Link | Your BluearmERP demo code | `supabase/templates/magic_link.html` |

5. Save each template.
6. Trigger mail from the **app** (forgot password, demo signup, signup if confirmations ON) — Dashboard preview alone is not enough.
7. Run the smoke matrix below and record results in [supabase-auth-emails-smoke.md](./supabase-auth-emails-smoke.md).

### Alternate: Management API script

From `bluearmerp-v3/` with a [personal access token](https://supabase.com/dashboard/account/tokens):

```bash
export SUPABASE_ACCESS_TOKEN=sbp_...
export SUPABASE_PROJECT_REF=your-project-ref
node scripts/apply-supabase-auth-email-templates.mjs
```

This PATCHes only the three mailer subject/content fields (confirm, recovery, magic_link). It does **not** change Confirm email, SMTP, or redirect URLs.

---

## Hard do-not list

1. Do **not** replace `{{ .ConfirmationURL }}` with a hand-built app verify URL.
2. Do **not** remove `{{ .Token }}` from `magic_link.html` (demo signup breaks).
3. Do **not** point recovery CTAs at `/auth/callback` or confirm CTAs at `/auth/reset-password`.
4. Do **not** redesign Supabase **Invite user** to match company invites (wrong product path).
5. Do **not** enable Send Email Hook / Edge Functions in this pass.
6. Do **not** change Google OAuth redirect URIs as part of email polish.
7. Do **not** flip hosted “Confirm email” without an explicit test plan.

---

## Smoke-test matrix

| # | Action | Pass criteria |
|---|--------|----------------|
| 1 | Forgot password → open mail → click link | Lands on `/auth/reset-password`; can set password ≥ 8 characters |
| 2 | Email signup (**only if** hosted confirmations ON) → open mail → click | Lands `/auth/callback`; then welcome/app as today |
| 3 | Email signup (**if** confirmations OFF) | No confirm mail expected; session/welcome path still works |
| 4 | Demo signup → open mail | **6-digit code visible**; entering it still provisions demo |
| 5 | Google sign-in | Unchanged (no Auth email) |
| 6 | Users → Invite teammate | Still API outbox / pending behavior — **unchanged** |

If 1–4 fail: check redirect allowlist, Auth SMTP, tracking disabled, and that Magic Link still contains `{{ .Token }}`.

Corporate mail that **prefetches** links can consume confirm/reset tokens early ([Supabase limitation](https://supabase.com/docs/guides/auth/auth-email-templates#email-prefetching)). Demo already uses OTP. If confirm/reset fails only on Microsoft 365, consider OTP-style confirm later — not part of this runbook’s apply steps.

---

## Deferred (not this runbook)

- HTML company invite body + **absolute** `https://…/signin` URL in `api/internal/modules/usermgmt/invite_outbox.go`
- Portal magic links, document email, digests (API / Gmail paths)

---

## See also

- [`supabase-setup.md`](./supabase-setup.md) — project, Google OAuth, redirects
- [`vercel-deploy.md`](./vercel-deploy.md) — production Site URL / Redirect URLs
- [`deploy-checklist.md`](./deploy-checklist.md) — release checklist including Auth email check
