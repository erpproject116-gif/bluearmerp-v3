# Pass 2 addendum — G-11, G-13, G-14, G-18, G-20

**Date:** 2026-08-26  
**Method:** Code trace only (no invented enums).

## Closures

| ID | Finding | Pack update |
|----|---------|-------------|
| G-11 | Supplier invoice has full submit → e_approval → approve/reject flow | Finance playbook |
| G-13 | Route→permission map published from `permissionCodes.ts` | `09-PERMISSIONS-ROUTE-MATRIX.md` |
| G-14 | Collective `e_approval` is a free PATCH status — no submit/approve API | Sell-chain playbook |
| G-18 | POS session status DB check: `open` \| `closed` only | POS playbook |
| G-20 | Mapping Center = `doc_generation_rules`; pairs + generate dispatch documented | Admin playbook |

## Key evidence paths

- `api/internal/modules/finance/supplier_invoice_approval.go`
- `api/migrations/131_po_si_e_approval.sql`
- `api/internal/modules/sales/collective_invoices.go` (`patchCollectiveInvoiceStatus`)
- `api/migrations/082_pos.sql` + `pos/sessions.go`
- `api/migrations/086_doc_generation_rules.sql` + `docgen/*` + `MappingCenterPage.tsx`
- `web/src/shared/permissionCodes.ts`
