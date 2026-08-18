# CMS article files

Markdown in `docs/content/blog/` is meant to be pasted into **Pages** (`/app/cms/pages/:id`).

The in-app editor stores **markdown**. Visual mode is a Word-like toolbar; Markdown mode is the source. Pasting a whole `.md` file (including YAML frontmatter) fills title, slug, and SEO, and puts only the body in the article.

## Generate in this shape

```markdown
---
series: sme-walang-sistema
number: 1
lang: tl
status: draft
title: Short title
slug: lowercase-hyphen-slug
seo_title: Browser tab title
seo_description: One or two sentences, max ~320 characters.
cms_paste:
  title: Short title
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

- CommonMark only: `##` / `###`, `**bold**`, `*italic*`, `-` or `1.` lists, `> quotes`, `[label](/app/…)` or `https://` links.
- No raw HTML in the body. No public image URLs; featured art is metadata, in-app images are uploaded in Pages.
- YAML frontmatter is for generation and paste — it is **not** part of the published body.
- After writing or generating a file, wrap it:

```bash
cd web && npm run format:cms-articles
```

That rewrites every `docs/content/blog/*.md` with wrapped paragraphs and blank lines around headings, using the same formatter the editor applies on paste.
