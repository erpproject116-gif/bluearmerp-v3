# Ops Intelligence Dashboards

Operational KPI surfaces for Leads, Tasks, Project, Clients, SOP, and OKR. These are **not** under `/bi`.

## Nav map

| Surface | Path | Permission / module |
|---|---|---|
| Leads dashboard | `/app/crm/leads/dashboard` | `crm.leads` |
| Tasks dashboard | `/app/operations/tasks` | `operations.dashboard` + operations module |
| Project dashboard | `/app/operations/dashboard` | `operations.dashboard` |
| Clients health | `/app/crm/clients` | `crm.clients` |
| SOP library / dashboard | `/app/sop`, `/app/sop/dashboard` | module `sop`, `sop.documents` |
| OKR list / dashboard | `/app/okr`, `/app/okr/dashboard` | module `okr`, `okr.objectives` |

## Client health score (rule table, not ML)

Start at **100**, then:

| Condition | Deduction |
|---|---|
| Open AR balance &gt; 0 | −25 |
| Credit limit on hold | −15 |
| Overdue follow-ups + overdue ops work items | −10 each, capped at −30 |
| Days since last commercial activity &gt; 90 | −25 |
| Days since last commercial activity &gt; 180 | −35 (instead of −25) |
| No commercial activity ever | −10 |

Clamp to 0–100. Last activity = max(quotation, sales, sales order) `order_date` for the partner.

## SOP stale

Published documents with `reviewed_at` older than **180 days** are stale (`staleReviewDays` in API).

Publish bumps `version` and inserts `sop_document_versions` snapshot. Body max **200KB**.

## OKR progress

- Per KR: `min(100, current_value / target_value * 100)` (manual updates only).
- Objective progress: average of its KR progresses.
- At risk: status `active`, progress &lt; 40%, and fewer than 30 days left in period.

## Tasks overdue

Ops work items: `end_date < today` and `status <> 'done'`. CRM follow-ups are a secondary count + deep-link only.

## Manual checklist

1. Scoped CRM user sees only own leads on Leads dashboard (PIC scope).
2. Switch operations workspace → Tasks dashboard tiles change.
3. Project dashboard shows BVA (if linked) + summary + risk + completion without manual widget insert.
4. Partner with open AR appears on Clients list; clearing AR / completing follow-ups improves score after refresh.
5. Disable `sop` or `okr` module → create/publish/write APIs blocked (module enablement middleware).
6. SOP publish creates a version row; stale tile lists only published past review window.
7. Create objective + 2 KRs → dashboard avg progress updates after KR current_value patches.
