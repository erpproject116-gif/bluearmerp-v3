# Capability matrix — HRIS / payroll / tax / bookkeeping

**Evidence date:** 2026-10-31  
**Legend:** **C** = Confirmed this session · **U** = Unknown / not re-opened · **N** = Not supported / reject for stated reason

Stars: GitHub API returned **403** this session for many repos; star counts below are from **WebSearch/GitHub page snippets** the same day — treat as **C (search)** not live API.

---

## Triage

| Tier | Project | Role |
|------|---------|------|
| Primary HR+payroll | [Frappe HR](https://github.com/frappe/hrms) | Full HRMS + payroll engine; needs ERPNext/Frappe |
| Primary HR+payroll | [Horilla HR](https://github.com/horilla/horilla-hr) | Lighter Django HRMS with payroll (v2.2 tax packs) |
| Primary accounting | [ERPNext](https://github.com/frappe/erpnext) | Full ERP accounting; pairs with Frappe HR |
| Primary PH tax *data* | [philippines-payroll-data](https://github.com/open-payroll-data/philippines-payroll-data) | Cited rate tables / JSON — **not** a payroll app |
| Primary PH tax *lib* | [opentaxjs](https://github.com/nedpals/opentaxjs) | Rules engine for PH tax calc — **not** filing |
| Secondary | Odoo Community + `l10n_ph` | CoA/taxes; payroll & full accounting often Enterprise |
| Secondary | OCA/payroll, OpenHRMS community modules | Community payroll on Odoo |
| Secondary | Paperless-ngx | Receipt/document archive + OCR |
| Secondary | Bigcapital | Modern AGPL accounting (no PH) |
| Secondary | hledger / Beancount+Fava | Plain-text books (technical users) |
| Secondary | Kimai, Jorani, OpenCATS | Point tools (time / leave / ATS) |
| Secondary | Payroll Engine (.NET) | Rules-as-code backend for developers |
| Reference only | Frappe `india-payroll` | Shows how statutory layers plug into Frappe HR — **India**, not PH |
| Source-available (not OSI OSS) | Akaunting (BSL), Invoice Ninja (Elastic-2.0) | Do not call “open source” in briefs |
| Reject / skip | Sentrifugo, TimeTrex dead mirrors, student `hrms` toys, Crater (stale per prior note — **U** re-check if needed) | Dead or unvetted |
| Commercial PH payroll SaaS | Sprout, Salarium, etc. | Safer for statutory payroll if custom OSS cannot be maintained — **not studied in depth** |

---

## HRIS & payroll suite matrix

| Dimension | Frappe HR | Horilla | Odoo CE | OrangeHRM / IceHrm | Dolibarr |
|-----------|-----------|---------|---------|--------------------|----------|
| Stars | **C** ~8,970 | **C** ~1,474 (`horilla/horilla-hr`) | **C** ~55k (monorepo) | **U** exact this session | **C** ~7.8k |
| License | **C** GPL-3.0 (`license.txt`) | **C** LGPL-2.1 | **C** LGPL-3.0 core (editions page) | OrangeHRM **C**/U GPL-3.0 (prior); IceHrm **U** | **C** GPL-3.0 |
| Freshness | **C** release v16.53.0 ~2026-10-30 | **C** 2.2.0/2.2.1 Oct 2026 | **C** active | **U** | **C** active |
| Stack | Python/JS on Frappe + ERPNext + MariaDB | Django 5.2 / Python 3.12+ / Postgres preferred | Python + PG | PHP | PHP |
| Employee / leave / attendance | **C** README | **C** README | **C** CE HR apps (editions) | Typical HRIS — **U** depth | Basic HR — **U** |
| Payroll compute | **C** salary structures, tax slabs, slips | **C** payroll engine, tax packs (2.2 notes) | **N** native `hr_payroll` = **Enterprise** (Odoo editions + forum) | Often paid edition — **U** per product | Records payments; compute **N**/weak |
| PH statutory payroll | **N** official app; India has `frappe/india-payroll` | **N** PH packs in README | Enterprise may have PH payroll localizations via partners — **U**; CE needs custom/OCA | **N** | **N** |
| Mobile / ESS | **C** Frappe HR mobile | **C** REST + mobile mentioned | CE limited vs Enterprise | **U** | **U** |
| Fit vs Bluearm HR | Reference / heavy alternative stack | Lighter alternative / learning | Open-core competitor | Point HRIS | Micro-ERP overlap |

### Corrections to prior paste

| Prior claim | This session |
|-------------|--------------|
| “No PH localization for Odoo” | **Wrong.** Official docs for Odoo 18/19/20 document **Philippines** fiscal localization (`l10n_ph`). CE vs Enterprise report depth differs. |
| Horilla path `horilla/horilla-hr` vs old `horilla-opensource/horilla` | **C** current deploy repo is `horilla/horilla-hr` (Docker rename note). |
| “Tiny PH payroll repos only” | Incomplete — **`philippines-payroll-data`** is a maintained, cited knowledge base (MIT) usable as tables, not as an app. |

---

## Accounting / tax / receipts matrix

| Dimension | ERPNext | Odoo `l10n_ph` | Bigcapital | Paperless-ngx | hledger / Beancount | opentaxjs |
|-----------|---------|----------------|------------|---------------|---------------------|-----------|
| Stars | **C** ~41k | (part of Odoo) | **C** ~4k | **C** ~47k | hledger **C** ~4.8k | **U** exact (~18 prior) |
| License | **C** GPL-3.0 | CE LGPL; reports often Enterprise | **C** AGPL-3.0 | **C** GPL-3.0 | GPL / AGPL variants | **C** MIT (README) |
| Double-entry / invoices | **C** | **C** (Accounting depth Enterprise-heavy) | **C** | **N** (DMS) | **C** books | **N** |
| PH CoA / VAT / WHT templates | PH CoA updates in ERPNext releases **C**; full BIR suite **N** in core `regional/` (no `philippines` folder) | **C** CoA, VAT 12%, WHT + ATC | **N** | **N** | DIY | Income-tax rules JSON **C** |
| BIR 2307 / 2550Q / SLSP / QAP | Partner/commercial apps (e.g. Comfac) — **not** official OSS core | **C** docs: 2307 XLS, SLSP, 2550Q, SAWT/QAP (edition-dependent); PDF/DAT limits documented | **N** | Archive only | **N** | **N** filing |
| Files BIR / eFPS | **N** | **N** (reference + export; external filing) | **N** | **N** | **N** | Explicitly **N** (README goals) |

---

## Reject / caution list

1. Calling Akaunting or Invoice Ninja “open source” (BSL / Elastic-2.0).  
2. Using &lt;5★ unlicensed PH calculator repos as production payroll.  
3. Assuming Frappe/ERPNext = BIR-ready without localization + CAS process.  
4. Browser/unofficial scrapers for SSS/BIR portals.  
5. Replacing Bluearm Finance/HR wholesale without a product decision.  

## Acceptance

- [x] Matrix complete with Confirmed vs Unknown  
- [x] PH gaps explicit  
- [x] Prior-paste corrections recorded  
