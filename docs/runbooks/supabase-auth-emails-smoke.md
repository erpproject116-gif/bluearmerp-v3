# Supabase Auth emails — smoke results

Fill this in after applying templates on the **hosted** Supabase project (see [`supabase-auth-emails.md`](./supabase-auth-emails.md)).

| Field | Value |
|-------|--------|
| Date (UTC+8 or note TZ) | 2026-08-13 (repo deliverables ready; hosted apply pending operator) |
| Operator | Agent prepared artifacts; Dashboard/API apply requires human token |
| Supabase project ref | `hqmhlvahlvrtxtwecdip` (from local link) |
| Web origin tested | _pending operator_ |
| Hosted “Confirm email” setting (ON/OFF) | _read during apply — do not flip_ |
| Auth custom SMTP configured? (Y/N) | _pending operator_ |
| Click tracking disabled on Auth SMTP? (Y/N/N/A) | _pending operator_ |

## Repo status (2026-08-13)

- [x] Templates in `supabase/templates/` (confirmation, recovery, magic_link)
- [x] Local `supabase/config.toml` wired; `enable_confirmations` left `false`
- [x] Runbook [`supabase-auth-emails.md`](./supabase-auth-emails.md)
- [x] Apply script `scripts/apply-supabase-auth-email-templates.mjs` (needs `SUPABASE_ACCESS_TOKEN`)
- [x] Deploy docs updated with `/auth/reset-password`
- [ ] Hosted templates applied (blocked: no `SUPABASE_ACCESS_TOKEN` in this environment; Supabase Management API list also failed network)
- [ ] Smoke matrix executed against live mail

**Operator next steps**

1. Ensure Redirect URLs include `{origin}/auth/callback` and `{origin}/auth/reset-password`.
2. Paste templates in Dashboard **or** run:

   ```bash
   export SUPABASE_ACCESS_TOKEN=sbp_...
   export SUPABASE_PROJECT_REF=hqmhlvahlvrtxtwecdip
   node scripts/apply-supabase-auth-email-templates.mjs
   ```

3. Complete the checklists below and replace this pending section.

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
