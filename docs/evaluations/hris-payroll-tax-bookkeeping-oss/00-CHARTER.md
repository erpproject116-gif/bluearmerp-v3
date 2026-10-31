# Charter — OSS HRIS / payroll / tax / bookkeeping study

**Status:** Accepted (study only)  
**Date:** 2026-10-31  
**Scope:** Decision-ready analysis of open-source (and source-available) HRIS, payroll, taxation, and bookkeeping tools **alongside** BluearmERP. No forks into `bluearmerp-v3`. No Bluearm migrations, deploys, or module rewrites in this task.

## Goals

1. Re-verify candidate stars, licenses, freshness, and PH-relevance from **primary sources** (README / LICENSE / official docs / GitHub metadata via search when API 403).
2. Separate **Confirmed** vs **Unknown**; do not treat the prior chat paste as proven where it said “from what I already knew.”
3. Map candidates against **existing Bluearm** HR and Finance surfaces (Observed-in-repo).
4. Produce adopt / defer / reference-only recommendations with honest PH compliance blockers.
5. Call out CAS / BIR filing / e-invoicing as **Needs-external-check** (accountant / BIR), not agent claims.

## Non-goals

- Vendoring Frappe HR, ERPNext, Horilla, Odoo, Paperless, etc. into Bluearm.
- Implementing PH payroll formulas, BIR print formats, or CAS registration in Bluearm.
- Replacing Bluearm Finance OR/AP/AR or HR leave/DTR/payroll with a second ERP without a separate product decision.
- Running production payroll or filing returns from this study.
- Claiming any OSS stack “files BIR for you” without evidence.

## Relationship to Bluearm (Observed-in-repo)

| Area | Bluearm today | Implication |
|------|---------------|-------------|
| HR & Payroll | `docs/modules/hr/README.md` — hire → onboard → attend → leave → payroll → remit; ESS | Not a greenfield HR need; evaluate **gap fill / reference / sidecar**, not blind replacement |
| Finance | `docs/modules/finance/README.md` — OR, SI, supplier invoices, PV, A/R & A/P books | Not a greenfield ledger need; evaluate tax/reporting/OCR sidecars and reference engines |
| Comms / Social | Separate prior study | Out of scope here |

## Tenancy / product question (open)

| Option | Meaning |
|--------|---------|
| **Ops-only** | Bluearm company uses external HR/payroll/tax tools for its own ops |
| **Platform feature** | Bluearm tenants get PH payroll/tax inside the product |
| **Hybrid** | Bluearm keeps HR/Finance core; sidecar for receipts OCR or reference rate tables only |

**Gate:** Product owner chooses before any adoption task.

## Acceptance (step 1)

- [x] Charter exists  
- [x] No application code touched  
