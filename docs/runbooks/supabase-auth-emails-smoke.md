# Supabase Auth emails — smoke results

Fill this in after applying templates on the **hosted** Supabase project (see [`supabase-auth-emails.md`](./supabase-auth-emails.md)).

| Field | Value |
|-------|--------|
| Date (UTC+8 or note TZ) | 2026-08-14 |
| Operator | Applied via `scripts/apply-supabase-auth-email-templates.mjs` (retry after ECONNRESET) |
| Supabase project ref | `hqmhlvahlvrtxtwecdip` |
| Web origin tested | _pending smoke_ |
| Hosted “Confirm email” setting (ON/OFF) | _read during smoke — do not flip_ |
| Auth custom SMTP configured? (Y/N) | _pending operator verify_ |
| Click tracking disabled on Auth SMTP? (Y/N/N/A) | _pending operator verify_ |

## Repo status (2026-08-14)

- [x] Templates in `supabase/templates/` (confirmation, recovery, magic_link)
- [x] Local `supabase/config.toml` wired; `enable_confirmations` left `false`
- [x] Runbook [`supabase-auth-emails.md`](./supabase-auth-emails.md)
- [x] Apply script `scripts/apply-supabase-auth-email-templates.mjs`
- [x] Deploy docs updated with `/auth/reset-password`
- [x] Hosted templates applied (`Applied Auth email templates to project hqmhlvahlvrtxtwecdip`)
- [ ] Smoke matrix executed against live mail

**Earlier failure:** `fetch failed` / `ECONNRESET` to `api.supabase.com` was a transient network drop (token was fine). Retry succeeded.

**Remaining operator steps**

1. Authentication → URL Configuration: `{origin}/auth/callback` **and** `{origin}/auth/reset-password`
2. Confirm Auth SMTP / disable click tracking for production
3. Complete smoke matrix below

## Redirect allowlist check

- [ ] `{origin}/auth/callback` present
- [ ] `{origin}/auth/reset-password` present
- [ ] Site URL matches the origin under test

## Template apply check

- [ ] Confirm signup subject + HTML from `supabase/templates/confirmation.html`
- [ ] Reset password subject + HTML from `supabase/templates/recovery.html`
- [ ] Magic Link subject + HTML from `supabase/templates/magic_link.html` (includes `{{ .Token }}`)
- [ ] Supabase Invite user template left default (not repurposed for company invites)

## Smoke matrix

| # | Result (pass/fail/skip) | Notes |
|---|-------------------------|-------|
| 1 Forgot password → `/auth/reset-password` | pending | |
| 2 Email signup confirm (only if confirmations ON) | pending | |
| 3 Email signup without confirm mail (if confirmations OFF) | pending | |
| 4 Demo OTP — 6-digit code visible + verify works | pending | |
| 5 Google sign-in unchanged | pending | |
| 6 Company invite still API outbox / pending | pending | |

## Blockers / follow-ups

- Hosted apply + live smoke require operator Supabase access (personal access token or Dashboard). Repo side of the plan is complete.
- Deferred: company invite HTML / absolute sign-in URL in `invite_outbox.go`.
