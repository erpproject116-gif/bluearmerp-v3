# Dead-code sweep (web)

**Last updated:** 2026-06-23  
**Tool:** [ts-prune](https://github.com/nadeesha/ts-prune) on `tsconfig.app.json`

## Run

```bash
cd web
npm run dead-code
```

Exit code is non-zero when unused exports exist; treat output as a **triage list**, not an automatic delete list.

## How to read results

| Pattern | Action |
|---------|--------|
| `lazyPages.ts` export unused in `App.tsx` | Wire route or remove lazy export + page if superseded |
| `shared/*.ts` type/helper unused | Often intentional public surface — keep unless confirmed dead |
| `(used in module)` suffix | False positive — used only inside same file |
| Page file with zero importers | Candidate for delete after route audit |

## Fixed in 2026-06-23 pass

| Item | Fix |
|------|-----|
| `SellingWorkspacePage`, `SellingReportsPage`, `ReceivableStatusReportPage` | Were lazy-loaded but routes redirected away — **wired** in `App.tsx` (`/app/selling`, `/app/selling/reports`, receivable-status) |

## Intentional keep (do not delete without review)

- Shared types exported for API symmetry (`entityTypes`, `taxcalc`, permission helpers)
- Lazy page exports for print routes and admin screens (loaded on demand)
- `debounce`, `useToastOptional` — utility reserves

## Doc dedup (guides ↔ KB)

- **Guides** (`documentationSections.ts`) — module overviews, stable nav copy
- **KB** (`moduleKbArticles.ts` + `knowledgebaseArticles.ts`) — scenario how-tos with `relatedGuideIds`
- **Cross-links:** `sectionKbCrossRefs.ts` builds inverse index; guide pages show **Related how-to articles**

Do not merge the two corpora into one file — different tone and update cadence. Link across instead.

## Next sweeps

1. Re-run after large route refactors; grep `Navigate href` for orphaned targets
2. Consider `knip` for unused files (ts-prune only sees unused exports)
3. Go: `staticcheck` / `unused` linter on `api/` (separate pass)
