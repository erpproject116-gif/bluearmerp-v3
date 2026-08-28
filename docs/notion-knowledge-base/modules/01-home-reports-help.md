# Module — Home, Reports, Help

## Home (`dashboard`)

**Owner view:** See how the business is doing today and what is stuck.  
**Path:** `/app/dashboard`  
**Related:** `/app/dashboard/onboarding`, `/app/dashboard/recent-updates`, `/app/setup`, approvals queue

### Features

| Feature | Path | Purpose |
|---------|------|---------|
| Dashboard | `/app/dashboard` | Greeting, receivables/payables, cash flow, day jobs, needs attention |
| Onboarding | `/app/dashboard/onboarding` | Tracked ERP + POS playbook |
| Recent updates | `/app/dashboard/recent-updates` | Product change notes |

### Happy path

1. Finish `/app/setup` if Start here still shows.  
2. Open Home — review Collect / Pay and Needs attention.  
3. Use Customize only for optional charts (keep Home light).  
4. Deep analytics → Reports module.  
5. Follow onboarding weeks until checked off.

### Gates

- Foundation incomplete → transactional API blocked elsewhere; Home shows checklist.  
- Permissions: `dashboard.view`, `kpis`, `charts`, `red_flags`, `financial_summary` (store_admin write defaults — **Observed** dashboard README).

### Red flags (pipeline)

low stock · quote expiry/conversion · serial mismatch · stale reserved · open PO · SO release gap · reserve-without-DR · DR-without-invoice · GR-without-SI · AP over-application  

### Builder view

- Widgets: `web/src/modules/dashboard/`  
- Red flags API under dashboard module  
- Deferred charts/alerts: dashboard README  

### Evidence

`docs/modules/dashboard/README.md`, `documentationSections.ts` (`dashboard`, `first-week`, `setup-wizard`)

---

## Reports (`reports`)

**Owner view:** Charts and saved report views without cluttering Home.  
**Path:** `/app/reports`

| Feature | Path |
|---------|------|
| Dashboard & charts | `/app/reports#reports-bi` |
| Catalog | `/app/reports#report-catalog` |
| Saved Views | `/app/reports/saved-views` |

### Happy path

1. Open Reports.  
2. Use BI section for charts.  
3. Open Catalog for named reports.  
4. Save a view for reuse.

### Gates / statuses

Module-level report permissions vary by report — full matrix **UNKNOWN** (gap G-13 family).  
Many operational reports also live under Selling / Buying / Sales Order / Finance hubs.

### Evidence

`modules.ts`; `web/src/modules/reports/`

---

## Help & guides (`documentation`)

**Owner view:** Plain-language how-to; no permission required for reading.  
**Paths:** `/app/documentation`, Baiko `/app/baiko`

| Feature | Purpose |
|---------|---------|
| Help & guides | Sections + knowledge base |
| Baiko | Assisted actions — approve path never silent ERP write |

### Builder view

SoT for in-app copy: `documentationSections.ts`, KB article TS files — not the Notion pack.  
Comms README notes Baiko: `POST /copilot/actions/approve`.

### Evidence

`docs/modules/documentation/README.md`, `docs/modules/comms/README.md`
