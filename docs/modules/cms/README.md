# Pages (in-app CMS)

Tenant-scoped page admin, media, and slugs. **Published reading** for the platform/marketing tenant is public at `/articles/{topic}/{slug}` (no sign-in). Other tenants’ pages stay in Pages admin and are not listed on that catalog.

This module is **not** Help & guides, SOP, or document attachments on quotations/sales/purchases.

## Operator notes

- Files persist as `file_bytes` in Postgres (`cms_media`). Disk under `CMS_UPLOAD_DIR` (default `data/cms-media`) is best-effort only; Render disk is ephemeral.
- Upload allowlist: PNG, JPEG, GIF, WebP, PDF. Max 25 MB. SVG/HTML/JS are rejected.
- Authenticated download is `/api/v1/cms/media/{id}/download`. Public images used on a published page use `/api/v1/public/cms/media/{id}/download`. Gzip middleware skips paths containing `/download`.
- Public catalog tenant is `CMS_PUBLIC_TENANT_CODE` (falls back to `DEMO_LEADGEN_TENANT_CODE`, default `BLUEARM`).
- SEO columns (`seo_title`, `seo_description`) set the browser tab and reader chrome.
- Page editor is Visual (toolbar) + Markdown source. Storage is markdown. Paste a generated `docs/content/blog/*.md` file to fill title/SEO and body. Format those files with `cd web && npm run format:cms-articles`.
- **Publish saves first.** Clicking Publish writes the current body, then sets status to published. Opening a published page that only shows the title usually means Publish was clicked before Save (fixed) or the body was empty.

## Routes

| Feature | Web | API |
|---------|-----|-----|
| Pages list (admin) | `/app/cms` | `GET /api/v1/cms/pages` |
| Page editor | `/app/cms/pages/:id` | `GET/PATCH /api/v1/cms/pages/{id}` |
| Form-field settings | `/app/cms/pages/settings` | existing form-field APIs, `entity_type=cms_page` |
| Articles hub (public) | `/articles` | `GET /api/v1/public/cms/pages` |
| Topic cluster (public) | `/articles/:topic` | `GET /api/v1/public/cms/pages?topic=` |
| Published article (public) | `/articles/:topic/:slug` | `GET /api/v1/public/cms/pages/by-slug/{slug}` |
| Legacy `/app/articles/…` | client redirect to `/articles/…` | — |
| Legacy slug (signed-in) | `/app/cms/p/:slug` | `GET /api/v1/cms/pages/by-slug/{slug}`, then client redirect |
| Media | `/app/cms/media` | `GET/POST /api/v1/cms/media` |
| Redirects | `/app/cms/redirects` | `GET/POST/DELETE /api/v1/cms/redirects` |

Permalink is **customizable** on the editor: topic cluster + slug, previewed as `/articles/{topic}/{slug}`. Changing a published slug still writes `cms_redirects`. Open published uses a new browser tab.

Changing the slug of a **published** page writes `cms_redirects` (default `leave_redirect=true`). The SPA follows `redirect_to` from by-slug (a full `/articles/…` path); there is no HTTP 301.

## Disable the module

User Management → Module & Features → turn off **Pages** (`cms`). Nav hides, and `POST/PATCH/DELETE` under `/api/v1/cms` are blocked by module enablement. Public `/articles` still serves the platform tenant’s published pages.

Who can read vs write is the Roles permission matrix (`cms`, `cms.pages`, `cms.pages_write`, `cms.media`, `cms.media_write`). Tenant owner and platform superadmin always have full access.

## Schema

| Migration | Purpose |
|-----------|---------|
| `253_cms_module.sql` | `cms_media`, `cms_pages`, `cms_redirects`, module `cms` (sort_order 57), permissions, store_admin write seed |
| `254_cms_page_topic.sql` | `cms_pages.topic` for `/articles/{topic}/{slug}` clusters |

## In-app documentation

| Artifact | Location |
|----------|----------|
| Guide section | `documentationSections.ts` → `cms` |
