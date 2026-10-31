# Final brief — OSS HRIS, payroll, tax & bookkeeping vs BluearmERP

**Date:** 2026-10-31  
**Pack:** `docs/evaluations/hris-payroll-tax-bookkeeping-oss/`  
**Mode:** Study only — docs under this folder; no Bluearm code/migrations/deploys

| Doc | Purpose |
|-----|---------|
| [00-CHARTER.md](./00-CHARTER.md) | Goals / non-goals / tenancy |
| [01-CAPABILITY-MATRIX.md](./01-CAPABILITY-MATRIX.md) | Confirmed vs Unknown matrix |
| [02-HRIS-PAYROLL-NOTES.md](./02-HRIS-PAYROLL-NOTES.md) | Frappe / Horilla / Odoo payroll |
| [03-TAX-BOOKKEEPING-NOTES.md](./03-TAX-BOOKKEEPING-NOTES.md) | ERPNext / Odoo PH / Paperless / tax libs |
| [04-BLUEARM-GAP-AND-GLUE.md](./04-BLUEARM-GAP-AND-GLUE.md) | Gap vs existing modules |
| [05-DECISION.md](./05-DECISION.md) | **DEFER dual-ERP** |

---

## Executive verdict

**Do not adopt ERPNext, Odoo, or Horilla as a second system of record inside the Bluearm product.** Bluearm already has HR→payroll and Finance AR/AP. For Philippine statutory work, **no OSS suite files BIR for you**; the realistic OSS pieces are **rate/reference libraries**, **optional Odoo PH fiscal templates** (edition-dependent), **Paperless for documents**, and **custom reports**—or a **commercial PH payroll** if you will not maintain SSS/PhilHealth/Pag-IBIG/BIR tables.

---

## Corrections to the prior chat paste

| Paste claim | Verified result |
|-------------|-----------------|
| Features/licenses mostly from memory | This pack re-checked READMEs/licenses/docs where fetch worked |
| “No Odoo PH localization” | **False** — official Odoo docs for `l10n_ph` (VAT, WHT/ATC, 2307 XLS, SLSP, 2550Q, etc.) |
| Tiny PH repos only | Incomplete — **`philippines-payroll-data`** is a serious cited knowledge base (MIT) |
| Horilla repo name | Prefer **`horilla/horilla-hr`** (current); old `horilla-opensource/horilla` deprecated for new deploys |
| Frappe = best base for PH payroll | Best **generic** OSS payroll engine; PH still custom (India has official extension; PH does not) |
| ERPNext RAM 4–8 GB | **Unknown** this session — not re-verified from hardware docs |

---

## What I’d pick (aligned with Bluearm)

| Need | Pick |
|------|------|
| Product PH payroll inside Bluearm | Extend Bluearm HR + `philippines-payroll-data` / `opentaxjs` + accountant QA |
| Receipt / certificate archive | Paperless-ngx sidecar |
| Company wants full HRMS UI *now*, Bluearm incomplete | Horilla (lighter) or Frappe HR (heavier) **ops-only**, dual-UI |
| Company already on Odoo for books | Odoo + `l10n_ph` (confirm Community vs Enterprise reports); don’t replace Bluearm ops ERP |
| Cannot maintain statutory rules | Commercial PH payroll SaaS + Bluearm people records |
| Freelancer personal books | hledger / Beancount — not Bluearm’s problem |
| Second full ERP for tenants | **Reject** without a deliberate multi-ERP product strategy |

---

## PH compliance stack (paper)

```
Bluearm HR (people, DTR, leave, payslip shell)
    + rate JSON / opentaxjs (calc)
    + custom remittance & 2316/1601 reports
Bluearm Finance (OR/SI/AP)
    + custom 2307/VAT summaries OR ops Odoo l10n_ph
Paperless-ngx (scans)
Accountant → eBIRForms / eFPS / EIS
```

Partner ERPNext BIR apps exist commercially; core ERPNext `regional/` has **no** Philippines folder.

---

## Blockers (honest)

1. Product path undecided (extend vs dual ERP vs commercial).  
2. Bluearm payroll/GL depth not fully audited beyond module READMEs.  
3. No live sandbox payroll or BIR export in this study.  
4. CAS / EIS / form versions need accountant/BIR confirmation.  
5. GitHub API 403 this session — some star counts from search snippets only.  

---

## Stop rules honored

- Missing evidence → Unknown.  
- No claim of unified BIR auto-filing.  
- No forks / Bluearm implementation.  
- Source-available ≠ open source labeled correctly (Akaunting, Invoice Ninja).  

## Next for product owner

1. Countersign [05-DECISION.md](./05-DECISION.md).  
2. Audit Bluearm payroll formulas and Finance GL depth (separate task).  
3. If PH statutory is P0: open an **implementation** task for Bluearm PH components + reports—not an ERPNext merge.  

---

## Confidence

- **Confident:** Frappe/Horilla/ERPNext/Odoo PH docs/licenses cited this session; Bluearm HR/Finance module READMEs; no core ERPNext PH BIR suite; opentaxjs and philippines-payroll-data roles.  
- **Approximate:** Exact star integers under API 403; Horilla/Frappe RAM; Community vs Enterprise report matrix for every Odoo minor version.  
- **Verify yourself:** CAS registration, EIS deadlines, accountant sign-off on any rate table before paying employees or filing.  
