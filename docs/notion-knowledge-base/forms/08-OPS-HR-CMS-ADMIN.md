# Operations · HR · CMS · Comms · Admin · Platform

Playbooks: `modules/07`, `modules/08`, `modules/09`

---

## Operations — `/app/operations/*`

### Work items · `ops_work_item` · Form Settings **Yes**

| Fields* | title, column, status, priority · + partner, start/end, description |
| Doc statuses | open \| in_progress \| done \| blocked (columns vary by pack) |
| Settings | `/app/operations/work-items/settings` |

### Other ops screens (thin)

| Screen | Path | Kind | Notes |
|--------|------|------|-------|
| Work hub | `/app/operations` | hub | |
| Industry packs | `/app/operations/packs` | config | draft `ops_pack` — UNKNOWN |
| Calendar / Timeline | `/app/operations/calendar`, `.../timeline` | board | |
| Project / Tasks dashboards | `/app/operations/dashboard`, `.../tasks` | board | open = status ≠ done |
| Job costing | `/app/operations/job-costing` | report/transaction | UNKNOWN |
| Automation | `/app/operations/automation` | config | UNKNOWN |

Workspaces may be active \| archived (doc).

---

## HR & Payroll — `/app/hr/*`

### Employees — `/app/hr/employees` · `hr_employee` · Form Settings **Yes**

Full field table: `01-FORMFIELDS-REGISTRY.md`  
Statuses: active \| inactive \| terminated

### Other HR windows (statuses known; fields UNKNOWN depth)

| Screen | Path | Statuses / notes |
|--------|------|------------------|
| Attendance / DTR | `/app/hr/attendance` | draft key `hr_attendance` |
| Leave | `/app/hr/leave` | draft → submitted → approved \| rejected \| cancelled · approve from submitted |
| Absenteeism | `/app/hr/absenteeism` | UNKNOWN |
| Discipline | `/app/hr/discipline` | open → … → closed |
| Hire onboarding | `/app/hr/hire-onboarding` | UNKNOWN |
| Evaluations | `/app/hr/evaluations` | UNKNOWN |
| Learning | `/app/hr/learning` | UNKNOWN |
| Pay items | `/app/hr/pay-items` | config |
| Payroll runs | `/app/hr/payroll-runs` | payslip draft → posted · filters active employees |
| 13th / Final pay | `/app/hr/special-runs` | UNKNOWN |
| Remittances | `/app/hr/remittances` | draft `hr_remittance` |
| My HR (ESS) | `/app/hr/ess` | employee self-service hub |

---

## CMS · SOP · OKR · Articles

| Screen | Path | Entity | Notes |
|--------|------|--------|-------|
| CMS Pages | `/app/cms` | `cms_page` Form Settings **Yes** | See `01` |
| Media | `/app/cms/media` | — | UNKNOWN |
| Redirects | `/app/cms/redirects` | — | UNKNOWN |
| Articles | `/articles` | — | UNKNOWN |
| SOP library / dashboard | `/app/sop`, `/app/sop/dashboard` | — | hub |
| OKR objectives / dashboard | `/app/okr`, `/app/okr/dashboard` | — | hub |

---

## Comms — `/app/comms/*`

Team Chat, Inbox, Sent Documents, Settings — **Kind:** hub · form depth **UNKNOWN** (messaging, not ERP docs).

---

## Admin — User management

| Screen | Path | Kind | Notes |
|--------|------|------|-------|
| Users | `/app/user-management/users` | config | |
| Roles | `/app/user-management/roles` | config | |
| Groups | `/app/user-management/groups` | config | |
| Data scopes | `/app/user-management/user-permissions` | config | |
| Module & Features | `/app/user-management/tenant-modules` | config | featureCode toggles |
| Process Policies | `/app/user-management/process-policies` | config | **Gates live here** — see `05-PROCESS-POLICIES-AND-GATES.md` |
| Mapping Center | `/app/user-management/mapping-center` | config | Doc generation rules: name, active, source/target entity, field_map, summarize_by, require_confirmed_source |
| Migration Center | `/app/user-management/migration-center` | config | |
| Demo Data | `/app/user-management/demo-data` | config | |
| Help feedback | `/app/user-management/help-feedback` | config | |

---

## Data Center

| Screen | Path | Notes |
|--------|------|-------|
| Ingestion rules | `/app/data-center/ingestion-rules` | match_fields / target_entity |
| Import inbox | `/app/data-center/inbox` | ingested_documents · match/status often pending → generated · targets PO, SO, supplier_invoice, journal_entry |

---

## Activity / Platform

| Screen | Path | Kind |
|--------|------|------|
| All activity | `/app/activity-logs` | ledger |
| Change log | `/app/activity-logs/changes` | ledger |
| Setup wizard | `/app/setup` | config — **Foundation HARD** blocks transactional POSTs until complete |
| Sign-in | `/signin` | platform |
| Approvals | `/app/dashboard/approvals` | board |

---

## Backlog (mine next for field depth)

Priority UNKNOWN closures:

1. HR Leave / Payroll / Discipline full forms  
2. Banking, Budgets, Fixed Assets  
3. Expenses / Vendor credits / Sales returns / Credit notes  
4. RFQ / Shipping order headers  
5. Quality NCR/QC/CAPA + Support ticket fields  
6. POS Manage settings keys  
7. Stock Reconciliation  

When closed: update this file + `00-INDEX.md` matrix + Notion Forms hub.
