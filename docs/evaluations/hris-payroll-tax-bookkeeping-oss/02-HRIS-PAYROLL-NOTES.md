# HRIS & payroll — mechanism notes

**Evidence date:** 2026-10-31

## Frappe HR (`frappe/hrms`)

**Confirmed from README + license.txt + releases/search**

- GPL-3.0; ~8.9k★; active (v16.53.0 ~2026-10-30).
- Modules (README): employee lifecycle, leave/attendance (incl. geolocation check-in), expense claims + ERPNext accounting link, performance/KRAs, **payroll & taxation** (structures, income tax slabs, standard + off-cycle payroll, salary slips), mobile PWA/app.
- Install path: Frappe bench + **ERPNext** + `hrms` app (Docker compose under `hrms/docker` for eval).
- Learning cost: Frappe Framework (Python/JS) — Confirmed as dependency, not “simple PHP.”

**PH payroll:** No official Philippines statutory app found. Closest pattern: [`frappe/india-payroll`](https://github.com/frappe/india-payroll) (GPL-3.0) extends Frappe HR with India EPF/ESI/PT/TDS — **Confirms the extension model**, not PH readiness.

**Custom PH path (paper only):** salary components for SSS / PhilHealth / Pag-IBIG; tax slabs for BIR withholding; formulas for 13th month / OT / night / holiday; reports for 2316, 1601-C, remittance lists, bank files. Tables should be driven from cited sources (see `philippines-payroll-data`) and accountant-validated. **Not implemented in this study.**

**RAM:** Prior “4 GB” figure — **Unknown** this session (not re-read from Frappe hardware docs). Mark Unknown.

## Horilla (`horilla/horilla-hr`)

**Confirmed from README + release notes**

- LGPL-2.1; ~1.5k★; default branch `2.0`; Docker image `horilla/horilla-hr`.
- Django 5.2, Python 3.12–3.14; scheduler process required for payslips/jobs.
- Features: recruitment, onboarding/offboarding, attendance (+ biometric hooks), leave, **payroll**, PMS, assets, helpdesk, projects/timesheets, REST API, optional geofence/face/Outlook add-ons (in repo, off by default).
- v2.2 payroll engine: configurable components, batch runs, **tax packs** with filing-status rules, payslip editing, formula helpers — still **no PH tax pack named** in release notes.

**Vs Frappe:** Lighter ops story (single Django app vs bench/ERPNext). Less “ERP gravity.” Weaker ecosystem for full inventory/manufacturing if that matters.

## Odoo Community HR + payroll

**Confirmed**

- Editions page: Community has Employees, Recruitment, Time Off, etc.; **Payroll is Enterprise**.
- Community payroll options: OCA/`payroll` (AGPL), Cybrosys `hr_payroll_community` / OpenHRMS — third-party; version-pin carefully (**U** quality for PH).
- PH fiscal localization exists for **accounting** (see tax notes doc); PH **payroll** localization for Enterprise/custom — **Unknown** depth without opening `hr_payroll_l10n_ph` sources.

## Point tools (thin)

| Tool | Confirmed role | Notes |
|------|----------------|-------|
| Kimai | Time tracking | AGPL per prior; plugins may be paid — **U** this session |
| Jorani | Leave only | MIT (prior) — **U** license re-open |
| OpenCATS | ATS | Legacy UI — prefer suite recruitment modules |
| Payroll Engine | .NET rules backend | MIT (prior); write PH rules yourself |

## Skip

- Sentrifugo / dead TimeTrex mirrors — do not adopt.
- Unvetted 0–3★ PH “full HRIS” repos as production cores.

## Sandbox status

No Frappe/Horilla sandbox payroll run in this task (no deploy). **Credential/deploy blocker** documented.

## Acceptance

- [x] Mechanism notes  
- [x] PH gap + India-extension pattern called out  
- [x] Sandbox blocker  
