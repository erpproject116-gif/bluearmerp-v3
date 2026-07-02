# Document generation (Mapping Center)

Tenant-configurable rules that drive **Generate Other Slips** from list toolbars.

## Routes

| Route | Purpose |
|-------|---------|
| `/app/user-management/mapping-center` | CRUD generation rules |
| List toolbars (SO, Quotation, PR) | Generate dropdown |

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/doc-generation/rules` | List rules |
| POST | `/api/v1/doc-generation/rules` | Create rule |
| PATCH | `/api/v1/doc-generation/rules/{id}` | Update rule |
| DELETE | `/api/v1/doc-generation/rules/{id}` | Delete rule |
| POST | `/api/v1/doc-generation/preview` | Validate batch |
| POST | `/api/v1/doc-generation/generate` | Execute generation |

## Default chains

Seeded rules mirror existing slip-line integrations: Quotation→SO, SO→Sales/DR, PR→PO, GR→Supplier Invoice.

Migration: `086_doc_generation_rules.sql`.
