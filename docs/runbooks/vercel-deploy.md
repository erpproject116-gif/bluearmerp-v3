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

No trailing slash on `VITE_API_BASE_URL`. Redeploy after changing env vars.

## Supabase Auth

Add to Supabase → Authentication → URL Configuration:

- Site URL: `https://YOUR-APP.vercel.app`
- Redirect URL: `https://YOUR-APP.vercel.app/auth/callback`

## SPA routing

`web/vercel.json` rewrites all routes to `index.html` so client-side routes work on refresh.

## Troubleshooting

| Error | Fix |
|-------|-----|
| `Could not find an exported function in api/...` | Set Root Directory to `web` |
| API calls fail / CORS | Set `CORS_ORIGIN` on Render to your Vercel URL |
| Blank app / auth errors | Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` on Vercel, redeploy |
