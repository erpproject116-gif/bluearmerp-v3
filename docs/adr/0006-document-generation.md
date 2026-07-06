# ADR 0006 — Document generation and Mapping Center

## Status

Accepted (2026-06)

## Context

BluearmERP exposes **Generate Other Slips** on list toolbars backed by tenant-configurable **Mapping Center** rules. Bluearm v3 already implements hard-coded slip-line chains (quotation→SO, PR→PO, etc.) but lacked a unified rule store and list-toolbar UX at the time of this ADR.

## Decision

1. Store tenant rules in `doc_generation_rules` (migration `086`) with source/target entity pairs, optional field maps, and summarize keys.
2. Expose CRUD under `/api/v1/doc-generation/rules` and execution under `POST /api/v1/doc-generation/generate` (batch limit 100).
3. Seed default rules matching existing chains so behavior is unchanged when tenants do not customize.
4. UI: **Mapping Center** under User Management; **Generate** dropdown on SO, Quotation, and PR lists via shared `GenerateOtherSlipsMenu`.
5. Log generations in `doc_generation_log` for audit.

## Consequences

- New document pairs require a rule row plus an executor in `docgen` package (or delegation to existing module handlers).
- Custom field maps are JSON-only; no freeform SQL in rules.
- Full automation for all pairs is incremental; preview/validate endpoints gate unsafe batches.

## References

- Migration `086_doc_generation_rules.sql`
- `api/internal/modules/docgen/`
- `web/src/modules/user-management/mapping-center/MappingCenterPage.tsx`
