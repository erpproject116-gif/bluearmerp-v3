# Taxation & bookkeeping — mechanism notes

**Evidence date:** 2026-10-31

## Hard truth (Confirmed)

**No evaluated OSS project fully files Philippine BIR returns for you.** At best: CoA/tax templates, XLS/PDF helpers, rate libraries, document archives — then a human uses eBIRForms / eFPS / EIS.

---

## ERPNext

**Confirmed**

- GPL-3.0; full accounting (invoices, bills, bank rec, multi-currency, inventory costing, statements) — README.
- Official `erpnext/regional/` tree (develop): australia, italy, south_africa, turkey, UAE, US — **no `philippines` folder**.
- Release notes (v16.28.0): Philippines **chart of accounts** updates — template support, not full BIR suite.
- Frappe Cloud “Philippines Compliance” page: **In Progress**, estimated completion **2026-02-28**, developed by partners (Comfac & Ambibuzz) — not a finished official OSS module.
- Commercial partner localization (Comfac `bureau_of_internal_revenue`) claims statutory reports — **not** in ERPNext core; treat as paid/partner path.

## Odoo Philippines localization

**Confirmed from odoo.com docs (18.0 / 19.0 / 20.0)**

| Capability | Docs say |
|------------|----------|
| Module `l10n_ph` | CoA, VAT 12% / exempt / zero-rated, withholding + **ATC** codes |
| BIR 2307 | Download **XLS**; Odoo 18: cannot generate official PDF/DAT natively |
| SLSP / SAWT / QAP | Export XLSX; DAT via external tool |
| 2550Q | Tax report for reference; not a ready-to-file BIR PDF |
| Odoo 20 docs | Claim PDF export for 2306 & 2307 via Tax Report — **edition/version dependent**; verify on the exact edition you buy/self-host |
| Checks | PCHC layout module |

**Community vs Enterprise:** Full Accounting + many report engines are Enterprise on the editions matrix. Community forks note some PH reports missing. **Confirm edition before committing.**

## Receipts / DMS

| Tool | Role | License |
|------|------|---------|
| Paperless-ngx | OCR, tags, email intake, archive of receipts / 2307 PDFs | **C** GPL-3.0 ~47k★ |
| Receipt Wrangler | Receipt OCR + split | **U** this session |

Paperless does **not** post journals to Bluearm/ERPNext.

## Plain-text & modern ledgers

| Tool | Fit | License posture |
|------|-----|-----------------|
| hledger | CLI + web; multi-currency incl. PHP DIY | GPL-3.0 (**C** search) |
| Beancount + Fava | Same class | Beancount license **U** this session |
| Bigcapital | QuickBooks-like SMB | AGPL-3.0 |
| Dolibarr | Cheap PHP ERP accounting | GPL-3.0 |
| GnuCash | Desktop sole prop | **U** |
| Akaunting | Bookkeeping | **BSL 1.1** — not OSI OSS |
| Invoice Ninja | Invoicing | **Elastic-2.0** — not OSI OSS; no SaaS resale |

## Tax engines (PH)

### opentaxjs (`nedpals/opentaxjs`)

**Confirmed README**

- MIT; rules-as-JSON calculator; PH income tax example via CDN rules.
- Explicit non-goals: **not** a filing solution; not legal advice; not complex advisory scenarios.
- Good candidate for **unit-tested withholding helpers** inside a future Bluearm payroll task — after accountant validation of rules JSON.

### philippines-payroll-data (`open-payroll-data/...`)

**Confirmed README**

- MIT; SSS / PhilHealth / Pag-IBIG / TRAIN tables with **primary source citations**; JSON + npm package; BIR issuance catalog links.
- For agents and developers as **reference data**, not a payroll runner.
- Still: “confirm against primary source for high-stakes decisions.”

### OpenFisca / US IRS Direct File / PolicyEngine

Reference designs only — **no PH package** found this session.

## Agentic bookkeeping

Young tools (shinkoku Japan e-Tax, beancount-io, etc.) — **reference patterns** only. Safe pattern: LLM drafts journal lines from bank CSV → **human approve every posting** (same spirit as social agent rules).

## Compliance topics — Needs-external-check

Do **not** treat as Confirmed without BIR/accountant:

- CAS / computerized accounting system registration or acknowledgment per installation  
- EOPT / invoice vs OR transition and EIS phase-in deadlines  
- PFRS for SMEs CoA mapping  
- Exact form list: 2550Q, 2551Q, 1601-EQ/C, 0619-E, 1604-C/E, 2307, 2316, 1701/1702, Alphalist, SLSP, QAP  

## Acceptance

- [x] Notes + Odoo PH correction  
- [x] No “files BIR for you” claim  
- [x] Data libs vs apps separated  
