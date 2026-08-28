# P0 closure addendum (2026-08-26)

Paste as a Notion callout under the parent knowledge-base page or as a child page.

## Decision

Do **not** re-wire advisory approval validators in this pass. Code comments + tests intentionally allow skip-friendly conversion. Closing the gap means **truthful labels and docs**, not silent re-enforcement that would break demos and skip-friendly tenants.

## Changes shipped

| Area | Change |
|------|--------|
| ADR 0005 | Amended: DR gate live; PR/SO/PO approval = advisory |
| Process Policies UI | Labels/help match advisory + accurate DR qty help |
| Help `process-policies` section | Same truth |
| Purchase Request README | No longer claims PO blocked until approved |
| Notion pack §§03–06 + sell/buy/finance playbooks | Aligned; G-01–G-04 / G-10 / G-12 closed or narrowed |

## Re-enable checklist (future PR)

When product wants hard gates again:

1. Restore logic in `ValidatePurchaseRequestForPO`, `ValidateSalesOrderApproval`, `ValidatePurchaseOrderApproval`.  
2. Flip `validate_test.go` expectations to require errors when policy on.  
3. Remove “(advisory)” from UI meta + Process Policies page.  
4. Update ADR + Notion gap register.  
5. Re-run golden S10 and a GR-from-draft scenario — expect failures when policy on.

## Still open (next pass candidates)

G-11 supplier invoice approve path · G-13 full permission matrix · G-14 collective `e_approval` · G-18 POS shift enum · G-20 Mapping Center schema
