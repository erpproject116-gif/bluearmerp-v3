# CMS article files

Markdown in `docs/content/blog/` is meant to be pasted into **Pages** (`/app/cms/pages/:id`).

Published reading URL is **`/articles/{topic}/{slug}`**, not `/app/cms/p/{slug}`. Set `topic` (cluster) and `slug` in the YAML; the editor permalink preview shows the full path. Old `/app/articles/…` links redirect.

The in-app editor stores **markdown**. Visual mode is a Word-like toolbar; Markdown mode is the source. Pasting a whole `.md` file (including YAML frontmatter) fills title, slug, and SEO, and puts only the body in the article.

## Generate in this shape

```markdown
---
series: sme-walang-sistema
number: 1
lang: tl
status: draft
title: Short title
topic: sme-walang-sistema
slug: lowercase-hyphen-slug
seo_title: Browser tab title
seo_description: One or two sentences, max ~320 characters.
cms_paste:
  title: Short title
  topic: sme-walang-sistema
  slug: lowercase-hyphen-slug
featured_image:
  filename: slug.jpg
  alt: Plain-language description of the photo.
---

Opening paragraph. Use **bold** and *italic*. Soft-wrap lines near 88 characters.

## Heading

Numbered lists:

1. First
2. Second
```

Rules:

- CommonMark only: `##` / `###`, `**bold**`, `*italic*`, `-` or `1.` lists, `> quotes`, `[label](/articles/…)` or `[label](/app/…)` or `https://` links. Images: `![alt](cms-media:12)` (upload) or `![alt](https://…)` (URL). YouTube: paste a watch URL on its own line, or `![YouTube](https://www.youtube.com/watch?v=…)`.
- No raw HTML in the body. HTTPS image URLs and YouTube watch/embed URLs are allowed. Featured art can still be uploaded in Pages.
- YAML frontmatter is for generation and paste — it is **not** part of the published body.
- After writing or generating a file, wrap it:

```bash
cd web && npm run format:cms-articles
```

That rewrites every `docs/content/blog/*.md` with wrapped paragraphs and blank lines around headings, using the same formatter the editor applies on paste.

## Topic clusters

`topic` in YAML is the public URL cluster (`/articles/{topic}/…`). Editors can type any kebab-case slug; these are the ones this series uses.

| Topic | Sakit na tinatalakay | Unang set |
|---|---|---|
| `bodega-at-stock` | “Meron pa” vs bodega; iisang on-hand | #1 |
| `benta-at-koleksyon` | “Bayad na” sa chat; naihatid hindi nasingil | #2, #3 |
| `quotation-at-follow-up` | Quote na namatay sa Viber/inbox | #4 |
| `pagbili-at-supplier` | Bili nang walang permiso | #5 |
| `serial-at-warranty` | Serial na “warranty pa ba?” | #6 |
| `vat-at-resibo` | VAT sa quote vs resibo | #7 |
| `books-at-pagsara` | Pagsara ng buwan; tatlong katotohanan | #8 |

Later clusters (not in the first set): `after-sales` (repair vs return), `tindahan-pos`, `withholding-at-2307`. The YAML `series: sme-walang-sistema` is the editorial series name, not the public URL cluster.
