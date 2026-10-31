# Path B implementation status

| Step | Acceptance | Status |
|------|------------|--------|
| 0 Decision doc | `workflows-path-b-decisions.md` | **Passed** |
| 1 Named recipes R1–R3 | `workflows-named-recipes.md` | **Passed** |
| 2 Production smoke | `workflows-step2-smoke.md` | **Blocked** — operator credentials |
| 3 Honest UI copy | Ops Automation + Outbound + CRM Workflows | **Passed** (in-repo) |
| 4 Spike | CONDITIONAL GO Activepieces Phase 1 | **Passed** |
| 5 CRM → Workflows nav + page | `/app/crm/workflows` | **Passed** (setup mode until engine URL + smoke) |
| 6 Inbound `crm.create_follow_up` + idempotency | migration 337 + `platform/workflows` | **Passed** (code; needs migration apply) |
| 7 Templates R1–R3 docs | `workflows-ap-templates/` | **Passed** (rebuild instructions; live import after smoke) |
| 8 Marketing | B-MARKETING-IN false | **Skipped** |
| 9 Baiko draft-assist code | Assist copy only; no Emit→LLM | **Passed** (docs/UI; no silent agent) |
| 10 Regression | No frozen package edits | **Passed** this session (touched CRM web, platform, docs, `.env.example` only) |

## Do not claim

- Production Workflows engine live
- GHL / Make / Activepieces parity
- Step 2 Done
