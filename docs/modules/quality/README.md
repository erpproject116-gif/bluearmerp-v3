# Quality (QMS)

NCRs, GR inspection hold/release, QC requests, CAPA.

| Artifact | Statuses |
|----------|----------|
| GR inspection | `pending`, `held`, `released` (held blocks GR post) |
| NCR | `open`, `in_review`, `closed` |
| QC request | `e_approval`, `unconfirmed`, `in_progress`, `completed` |
| CAPA | default `open`; create-only API today |

**Plain-language playbook:** [Notion pack — CRM & service](../../notion-knowledge-base/modules/06-crm-aftersales-quality-support-booking.md)

**API:** `api/internal/modules/quality/` · Migrations `081`, `101`, `132`
