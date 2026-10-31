# Signed decision — HRIS / payroll / tax / bookkeeping OSS

**Date:** 2026-10-31  
**Bluearm implementation in this task:** **None**

---

## Verdict

### **DEFER adoption of a second full ERP (ERPNext / Odoo / Horilla) as Bluearm’s system of record**

Bluearm already documents HR→payroll and Finance AR/AP. Parallel SoR creates dual books and product confusion.

### **ALLOW (study / ops / future product tasks)**

| Action | Allowed? |
|--------|----------|
| Use `philippines-payroll-data` + `opentaxjs` as **reference** for a future Bluearm PH payroll task | Yes (separate implementation task; accountant validation required) |
| Ops trial of Paperless-ngx for receipt/2307 archive | Yes, outside Bluearm repo |
| Ops-only Horilla or Frappe HR for company HR if Bluearm payroll is incomplete | Yes, dual-UI, no fork |
| Odoo Enterprise + `l10n_ph` for a company already standardized on Odoo | Possible ops path — not Bluearm core |
| Partner ERPNext BIR localization (Comfac etc.) | Commercial evaluation only |
| Vendoring any of the above into `bluearmerp-v3` | **No** |
| Claiming OSS “files BIR automatically” | **No** |

### Prefer if / when building PH compliance **in** Bluearm

1. Extend existing HR payroll + Finance reports.  
2. Drive rates from cited tables (MIT data pack) + tested calculators.  
3. Paperless (or similar) as document sidecar.  
4. Human + accountant for remittance and eFPS/eBIRForms/EIS.

### Prefer if / when **not** maintaining statutory rules

Commercial PH payroll (Sprout/Salarium-class — not deep-audited here) + Bluearm for employment records.

---

## Blockers

| ID | Blocker | Status |
|----|---------|--------|
| B1 | Product path: extend Bluearm vs dual ERP vs commercial payroll | **Open** |
| B2 | Depth of Bluearm payroll math & Finance GL vs module README | **Unknown** — needs product audit |
| B3 | No sandbox payroll/tax run this study | **Open** |
| B4 | BIR CAS / EIS / form currency — legal process | **Needs-external-check** |
| B5 | Odoo edition choice if ops picks Odoo | **Unknown** until license quote |

---

## Signature

| Role | Name | Decision | Date |
|------|------|----------|------|
| Study author (Agent) | Cursor study pass | **Recommend: DEFER dual-ERP; prefer Bluearm + reference libs / optional Paperless** | 2026-10-31 |
| Product owner | ________________ | ☐ Agree ☐ Override: ___ | __________ |

## Acceptance

- [x] Signed recommendation  
- [x] No Bluearm code  
