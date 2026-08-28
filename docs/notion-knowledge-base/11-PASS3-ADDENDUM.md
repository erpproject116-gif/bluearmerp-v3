# Pass 3 addendum — remaining P1/P2 gaps

**Date:** 2026-08-26  
**Method:** Migrations + API handlers + help groups (Observed).

| ID | Result |
|----|--------|
| G-15 | NCR: `open` \| `in_review` \| `closed` (DB check). API sets `closed_at` when closed. |
| G-16 | CAPA: default `open`; **no** DB enum; **list+create only** (no PATCH). |
| G-17 | Work items: `open` \| `in_progress` \| `done` \| `blocked`. Workspace: `active` \| `archived`. |
| G-19 | Leave + discipline (+ absenteeism alerts) enums documented. |
| G-21 | Data Center UI targets: `purchase_order`, `sales_order`, `supplier_invoice`, `journal_entry`. |
| G-22 | Perms: `activity_logs.logs` / `changes` + role flag; **no** audit retention purge job found. |
| G-23 | Intake `open`→`converted`→RO; RO progress six values. |
| G-24 | WO: `draft`→`released`→`completed`; **cancel only while draft**. |
| G-30 | Mitigated by Notion playbooks (READMEs still thin/missing). |
| G-31 | **Fixed:** booking added to help `service` group. |
| G-32 | SOP/OKR: **no** `documentationSections` entries — pack remains SoT. |

Evidence index: `11-PASS3-ADDENDUM.md` (this file) + updated module playbooks + `06-GAP-REGISTER.md`.
