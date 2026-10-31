# Bluearm gap map & glue options (paper only)

**Evidence date:** 2026-10-31  
**Bluearm sources:** `docs/modules/hr/README.md`, `docs/modules/finance/README.md`

## What Bluearm already owns

| Domain | Present (docs) | Typical OSS “replacement” temptation |
|--------|----------------|--------------------------------------|
| HR lifecycle | Hire → onboard → attend → leave → payroll → remit; ESS; discipline/absence/DTR statuses | Frappe HR / Horilla |
| Finance AR/AP | Official receipts, supplier invoices, payment vouchers, A/R & A/P books, SI receipt status | ERPNext / Odoo / Bigcapital |

**Implication:** Adopting a second full ERP (ERPNext or Odoo) as the system of record **duplicates** Bluearm’s core value. Default posture: **extend Bluearm** or add **thin sidecars**, not dual-ledger.

## Likely gaps (inferred — verify in product)

These are **not** proven missing by reading only the short module READMEs; mark **Unknown until product audit**:

| Gap class | Examples | OSS that helps |
|-----------|----------|----------------|
| PH statutory payroll math | SSS, PhilHealth, Pag-IBIG, WHT slabs, 13th month, premiums | Rate tables (`philippines-payroll-data`) + `opentaxjs` / formulas in Bluearm HR |
| BIR employer forms from payroll | 2316, 1601-C, 1604-C, alphalists | Custom Bluearm reports — not Frappe-out-of-box |
| BIR purchase/sales tax packs | 2307, 2550Q, SLSP, QAP/SAWT | Odoo `l10n_ph` (edition-dependent) **or** custom Bluearm reports; ERPNext core insufficient |
| Document archive | Scanned ORs, 2307 PDFs, receipts | Paperless-ngx sidecar |
| Full general ledger / PFRS statements | If Finance MVP is AR/AP-centric only | Unknown — audit whether Bluearm has full GL; if not, ERPNext/Odoo is heavy; prefer extend Finance |
| CAS / e-invoice | Registration + EIS | Process + possibly partner middleware — not an OSS checkbox |

## Glue options (no implementation)

| Option | Description | When |
|--------|-------------|------|
| **A. Stay in Bluearm** | Build PH components/reports in existing HR/Finance | Platform wants PH compliance as product |
| **B. Reference libs only** | Vendor **data** (MIT tables) + optional opentaxjs into Bluearm calc services | Lowest dual-system risk |
| **C. Paperless sidecar** | Dual-UI; link/store doc IDs later | Receipt chaos is the pain |
| **D. Ops-only Frappe/Horilla** | Company payroll outside Bluearm | Ops needs mature HRMS UI now; tenants stay on Bluearm |
| **E. Dual ERP (ERPNext/Odoo)** | Parallel system of record | **Defer** — highest conflict with Bluearm Finance/HR |
| **F. Commercial PH payroll** | Sprout/Salarium + Bluearm HR for people data | Cannot maintain statutory rules in-house |

**Written pick (conditional):**

```
IF product priority = PH compliance inside Bluearm:
  Pick = A + B (+ C for docs)
  Do NOT adopt ERPNext/Odoo as SoR

ELSE IF ops-only company payroll urgent AND Bluearm payroll incomplete:
  Pick = D (Horilla lighter) OR F (commercial) + keep Bluearm people records
  Frappe HR only if team accepts Frappe/ERPNext ops cost

ELSE IF accountant already on Odoo Enterprise PH:
  Pick = keep Odoo for books; Bluearm for ops ERP — integration later (separate task)

ELSE:
  DEFER heavy sidecars; run product gap audit on Bluearm HR payroll + Finance GL depth
```

## Acceptance

- [x] Gap map vs Bluearm  
- [x] Glue pick conditional on product path  
