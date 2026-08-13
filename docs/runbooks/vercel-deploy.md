# Deploy SolidJS web app to Vercel

The Go API runs on **Render** (or Cloud Run), not Vercel. If Vercel tries to compile Go files under `api/`, the project is misconfigured.

## Vercel project settings

| Setting | Value |
|---------|--------|
| **Root Directory** | `web` |
| Framework Preset | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm install` |

Setting **Root Directory** to `web` is the most important step — Vercel will not scan `api/` for Go serverless functions.

## Environment variables (Production)

| Name | Value |
|------|--------|
| `SUPABASE_URL` | `https://YOUR_REF.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase anon public key |
| `VITE_API_BASE_URL` | Render API URL, e.g. `https://bluearm-api.onrender.com` |

No trailing slash on `VITE_API_BASE_URL`. **Redeploy after changing env vars** — Vite bakes `VITE_*` into the JS bundle at build time; updating the dashboard alone does not change a live deployment.

`vite.config.ts` reads Vercel dashboard variables via `process.env` during `npm run build`, so you do not need a `.env` file in the repo.

## Supabase Auth

Add to Supabase → Authentication → URL Configuration:

- Site URL: `https://YOUR-APP.vercel.app`
- Redirect URLs (both required):
  - `https://YOUR-APP.vercel.app/auth/callback`
  - `https://YOUR-APP.vercel.app/auth/reset-password`

Branded Auth email templates (confirm, reset, demo OTP) and Auth SMTP: [`supabase-auth-emails.md`](./supabase-auth-emails.md).

## SPA routing

`web/vercel.json` rewrites all routes to `index.html` so client-side routes work on refresh.

## Troubleshooting

| Error | Fix |
|-------|-----|
| `Could not find an exported function in api/...` | Set Root Directory to `web` |
| "Cannot reach the API" / mentions port 8080 | Old builds showed a misleading dev message on **any** network failure. Redeploy after setting `VITE_API_BASE_URL`. New builds show the actual API URL or "not configured". |
| API calls fail / CORS | On Render set `CORS_ORIGIN=https://YOUR-APP.vercel.app` (exact origin, no trailing slash). Test `https://YOUR-RENDER-URL/health` in a browser. |
| Blank app / auth errors | Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` on Vercel, redeploy |
