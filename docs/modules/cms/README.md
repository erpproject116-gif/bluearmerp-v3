# Pages (in-app CMS)

Tenant-scoped page admin, media, and slugs. **Published reading** for the platform/marketing tenant is public at `/articles/{topic}/{slug}` (no sign-in). Other tenants’ pages stay in Pages admin and are not listed on that catalog.

This module is **not** Help & guides, SOP, or document attachments on quotations/sales/purchases.

## Operator notes

- Files persist as `file_bytes` in Postgres (`cms_media`). Disk under `CMS_UPLOAD_DIR` (default `data/cms-media`) is best-effort only; Render disk is ephemeral.
- Upload allowlist: PNG, JPEG, GIF, WebP, PDF. Max 25 MB. SVG/HTML/JS are rejected.
- Authenticated download is `/api/v1/cms/media/{id}/download`. Public images used on a published page use `/api/v1/public/cms/media/{id}/download`. Gzip middleware skips paths containing `/download`.
- Public catalog tenant is `CMS_PUBLIC_TENANT_CODE` (falls back to `DEMO_LEADGEN_TENANT_CODE`, default `BLUEARM`).
- SEO columns (`seo_title`, `seo_description`) plus given fallbacks (title / first paragraph) power public HTML meta, Open Graph, and JSON-LD on `/articles`.
- Production `/articles*` is rendered by a Vercel function (`web/api/cms-public.ts`) that calls the public CMS API. Set `CMS_API_BASE_URL` (Render) and `PUBLIC_SITE_URL` on Vercel. Local `npm run dev` still uses the SPA reader.
- Page editor is Visual (toolbar) + Markdown source. Storage is markdown. Visual mode is a `div` (not a form label) so it stays typeable. Toolbar includes Image URL (`![alt](https://…)`) and YouTube (`![YouTube](https://www.youtube.com/watch?v=…)`). Paste a generated `docs/content/blog/*.md` file to fill title/SEO and body. Format those files with `cd web && npm run format:cms-articles`.
- **Publish saves first.** Clicking Publish writes the current body, then sets status to published. Opening a published page that only shows the title usually means Publish was clicked before Save (fixed) or the body was empty.
- Public articles append a Facebook follow/share footer (chrome, not stored in the body).
- Unpublish returns a page to draft (public URL 404s). Preview issues a 30-minute token (`?preview=`). PATCH with a stale `updated_at` returns 409. `cms.pages_publish` gates Publish/Unpublish/Archive (owners always allowed). Draft with Baiko is catalog-tenant only and never publishes.

## Routes

| Feature | Web | API |
|---------|-----|-----|
| Pages list (admin) | `/app/cms` | `GET /api/v1/cms/pages` |
| Page editor | `/app/cms/pages/:id` | `GET/PATCH /api/v1/cms/pages/{id}` |
| Form-field settings | `/app/cms/pages/settings` | existing form-field APIs, `entity_type=cms_page` |
| Articles hub (public) | `/articles` | `GET /api/v1/public/cms/pages` |
| Topic cluster (public) | `/articles/:topic` | `GET /api/v1/public/cms/pages?topic=` |
| Published article (public) | `/articles/:topic/:slug` | `GET /api/v1/public/cms/pages/by-slug/{slug}` |
| Article markdown twin | `/articles/:topic/:slug.md` | same JSON, rendered by Vercel |
| Draft preview | `/articles/:topic/:slug?preview=` | `GET /api/v1/public/cms/preview?token=` |
| Baiko draft (catalog tenant) | editor button | `POST /api/v1/cms/pages/{id}/generate` |
| Unpublish | editor button | `POST /api/v1/cms/pages/{id}/unpublish` |
| Legacy `/app/articles/…` | client redirect to `/articles/…` | — |
| Legacy slug (signed-in) | `/app/cms/p/:slug` | `GET /api/v1/cms/pages/by-slug/{slug}`, then client redirect |
| Media | `/app/cms/media` | `GET/POST /api/v1/cms/media` |
| Redirects | `/app/cms/redirects` | `GET/POST/DELETE /api/v1/cms/redirects` |

Permalink is **customizable** on the editor: topic cluster + slug, previewed as `/articles/{topic}/{slug}`. Changing a published slug still writes `cms_redirects`. Open published uses a new browser tab.

Changing the slug of a **published** page writes `cms_redirects` (default `leave_redirect=true`). Production HTML returns **HTTP 301** from `redirect_to` and from `/app/articles/*`. The SPA/dev client still follows JSON `redirect_to` with a client navigate.

Crawler files on the site origin: `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/articles.md`, `/articles/{topic}/{slug}.md`.

## Disable the module

User Management → Module & Features → turn off **Pages** (`cms`). Nav hides, and `POST/PATCH/DELETE` under `/api/v1/cms` are blocked by module enablement. Public `/articles` still serves the platform tenant’s published pages.

Who can read vs write is the Roles permission matrix (`cms`, `cms.pages`, `cms.pages_write`, `cms.pages_publish`, `cms.media`, `cms.media_write`). Tenant owner and platform superadmin always have full access.

## Schema

| Migration | Purpose |
|-----------|---------|
| `253_cms_module.sql` | `cms_media`, `cms_pages`, `cms_redirects`, module `cms` (sort_order 57), permissions, store_admin write seed |
| `254_cms_page_topic.sql` | `cms_pages.topic` for `/articles/{topic}/{slug}` clusters |
| `255_cms_maturity.sql` | `lang`, `focus_phrase`, `visibility`, revisions, `cms.pages_publish` |

## In-app documentation

| Artifact | Location |
|----------|----------|
| Guide section | `documentationSections.ts` → `cms` |
