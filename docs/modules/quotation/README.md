# Quotation module

## Scope

Commercial quotations with Tax Management sub-branch.

| Feature | Route | API |
|---------|-------|-----|
| Quotation List | `/app/quotation/quotations` | `GET /api/v1/quotation/quotations` |
| New Quotation | `/app/quotation/quotations/new` | `POST /api/v1/quotation/quotations` |
| Quotation Status | `/app/quotation/quotations/status` | `GET /api/v1/quotation/quotations/status-report` |
| Outstanding Quote Status | `/app/quotation/quotations/outstanding` | `GET /api/v1/quotation/quotations/outstanding-report` |
| Print | new tab from grid | `GET /api/v1/quotation/quotations/{id}/print` |
| Tax Types | `/app/quotation/tax-mngt/tax-types` | `GET /api/v1/quotation/tax-types` |
| Currencies | `/app/quotation/tax-mngt/currencies` | `GET /api/v1/quotation/currencies` |
| Form settings | `/quotation/quotations/settings` | `quo_quotation` entity |

## Dependencies

- **Inventory** module (partners, items, locations, stock balances)
- **Tax Management** sub-branch owns transaction types; quotations reference `quo_tax_types`

## Sequences

- Date-No.: `MM/DD/YYYY-N` via `quotation_date_seq`
- Reference No.: `YYMMDD###` via `quotation_reference_no`

## Outstanding report

Default filters: `balance_qty > 0` and stock at Location-Out `>= balance_qty` when `require_stock=true`.

## Migrations

`009_inv_stock_balances.sql`, `010_quotation_tax_mngt.sql`, `011_quotations.sql`

Seed: `scripts/seed-demo-quotations.sql` after inventory seed.

Optional BLUEARM list export (~250 quotes from real data): `scripts/seed-demo-quotations-export.sql` (generate via `scripts/generate-quotation-seed-from-export.py`).
