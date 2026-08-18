# Pages (in-app CMS)

Tenant-scoped pages, media, and in-app slugs for **signed-in ERP users only**. There is no public HTML origin, no `sitemap.xml`, and no anonymous API.

This module is **not** Help & guides, SOP, or document attachments on quotations/sales/purchases.

## Operator notes

- Files persist as `file_bytes` in Postgres (`cms_media`). Disk under `CMS_UPLOAD_DIR` (default `data/cms-media`) is best-effort only; Render disk is ephemeral.
- Upload allowlist: PNG, JPEG, GIF, WebP, PDF. Max 25 MB. SVG/HTML/JS are rejected.
- Download path is `/api/v1/cms/media/{id}/download` so gzip middleware skips compression.
- SEO columns (`seo_title`, `seo_description`) set the in-app browser tab and reader chrome. They are **not** exposed to crawlers.
- Page editor is Visual (toolbar) + Markdown source. Storage is markdown. Paste a generated `docs/content/blog/*.md` file to fill title/SEO and body. Format those files with `cd web && npm run format:cms-articles`.

## Routes

| Feature | Web | API |
|---------|-----|-----|
| Pages list | `/app/cms` | `GET /api/v1/cms/pages` |
| Page editor | `/app/cms/pages/:id` | `GET/PATCH /api/v1/cms/pages/{id}` |
| Form-field settings | `/app/cms/pages/settings` | existing form-field APIs, `entity_type=cms_page` |
| Reader | `/app/cms/p/:slug` | `GET /api/v1/cms/pages/by-slug/{slug}` |
| Media | `/app/cms/media` | `GET/POST /api/v1/cms/media` |
| Redirects | `/app/cms/redirects` | `GET/POST/DELETE /api/v1/cms/redirects` |

Changing the slug of a **published** page writes `cms_redirects` (default `leave_redirect=true`). The SPA follows `redirect_to` from by-slug; there is no HTTP 301.

## Disable the module

User Management → Module & Features → turn off **Pages** (`cms`). Nav hides, and `POST/PATCH/DELETE` under `/api/v1/cms` are blocked by module enablement.

Who can read vs write is the Roles permission matrix (`cms`, `cms.pages`, `cms.pages_write`, `cms.media`, `cms.media_write`). Tenant owner and platform superadmin always have full access.

## Schema

| Migration | Purpose |
|-----------|---------|
| `253_cms_module.sql` | `cms_media`, `cms_pages`, `cms_redirects`, module `cms` (sort_order 57), permissions, store_admin write seed |

## In-app documentation

| Artifact | Location |
|----------|----------|
| Guide section | `documentationSections.ts` → `cms` |
