# Module — User Management, Data Center, Activity Logs

## User Management

**Path:** `/app/user-management/users`  
**Purpose:** Who can sign in, what they can do, which modules are on, how strict processes are, how data is imported.

### Features

| Feature | Path | Notes |
|---------|------|-------|
| Users | `.../users` | Invite-first Google provisioning |
| Roles | `.../roles` | `member`, `store_admin`, custom |
| Groups | `.../groups` | |
| Data scopes | `.../user-permissions` | |
| Module & Features | `.../tenant-modules` | featureCode switches |
| Process Policies | `.../process-policies` | `process_policies` featureCode |
| Mapping Center | `.../mapping-center` | Doc generation / Generate Other Slips rules |
| Migration Center | `.../migration-center` | Import / cutover |
| Demo Data | `.../demo-data` | Golden scenarios populate |
| Help feedback | `.../help-feedback` | |

### User statuses (Observed)

`active` | `invited` | `disabled`  
Soft-delete/restore; pending invite resend (KB).

### Superadmin checklist

1. Invite users → assign roles.  
2. Enable only needed modules/features.  
3. Set process policies (skip-friendly vs strict).  
4. Optional: Mapping + Migration for cutover.  
5. Optional: Demo Data for training; verify S2–S12.  

### Mapping Center (G-20 closed)

**Path:** `/app/user-management/mapping-center`  
**API:** `/api/v1/doc-generation/rules` (+ generate/preview)  
**Table:** `doc_generation_rules` (migration `086`)

#### Rule fields (Observed)

| Field | Type / default | Meaning |
|-------|----------------|---------|
| `name` | text | Rule label |
| `active` | bool default true | Used by resolve |
| `source_entity` / `target_entity` | text | Pair key |
| `field_map` | jsonb default `{}` | Stored JSON; generation today dispatches by pair to module helpers (not a free-form field rewriter) |
| `summarize_by` | text[] default `{}` | e.g. `partner_id` on seeded defaults |
| `require_confirmed_source` | bool default true | Prefer confirmed source before generate |

#### UI pairs (`MappingCenterPage.tsx`)

Quotation→SO · SO→Sales · SO→Delivery Receipt · SO→Release · PR→PO · Bill←PO · Bill←GR (legacy)

#### Generate pairs supported in API (`docgen/generate.go`)

| Pair | Automated? |
|------|------------|
| `quotation->sales_order` | Yes → CreateFromQuotation |
| `sales_order->sales` | Yes → CreateFromSalesOrder |
| `sales_order->delivery_receipt` | Yes |
| `sales_order->purchase_request` | Yes |
| `purchase_request->purchase_order` | Yes |
| `goods_receipt->supplier_invoice` | Yes |
| `purchase_order->supplier_invoice` | Yes |
| `sales_order->release` | Validated in preview list; **execute** returns “not yet automated” |

Max batch: 100 source IDs. Log: `doc_generation_log`.

**Permissions:** href map → `user_management.users`; registry also has `user_management.doc_generation` (grant both for admins).

### UNKNOWN

- Whether every `field_map` key is consumed by any helper (today pairs use hardcoded create helpers)
- Cutover Mapping vs Migration Center deeper schemas beyond docgen rules

### Evidence

`docs/modules/user-management/README.md` (thin), demo-scenarios README, `api/internal/modules/usermgmt/`, `migration/`, `docgen/`, `MappingCenterPage.tsx`

---

## Data Center (G-21 closed)

**Path:** `/app/data-center/ingestion-rules`  
**Features:** Ingestion rules · Import inbox  
**Permissions:** `data_center.read` (list/inbox) · `data_center.manage` (rules CRUD)

### Target entities (UI allow-list)

**Observed:** `IngestionRulesPage.tsx` `TARGET_ENTITIES`:

1. `purchase_order`  
2. `sales_order`  
3. `supplier_invoice`  
4. `journal_entry`  

API stores `target_entity` as free text (no DB check) — treat the UI list as the product surface.

### Document inbox statuses (table defaults)

`ingested_documents`: `match_status` default `pending`; `status` default `pending` (migration `091`). Generate response may set status `generated`.

### Happy path

1. Define ingestion rules (target + match_fields JSON).  
2. Upload to inbox.  
3. Stage / match → generate into target entity.

### Evidence

`web/src/modules/data-center/IngestionRulesPage.tsx`, `api/migrations/091_data_ingestion.sql`, `datacenter/*`

---

## Activity Logs (G-22 closed)

**Path:** `/app/activity-logs` · Change log `/app/activity-logs/changes`  
**API:** `GET /activity-logs`, `GET /activity-logs/changes`  
**Auth:** `RequireViewActivityLogsOrRecordScoped` / `RequireViewChangeLogsOrRecordScoped` → permissions `activity_logs.logs` / `activity_logs.changes` (also role `can_view_activity_logs`). Member seed defaults **deny** for activity_logs module.

### Retention

**Observed:** `platform/retention` job is for **subscription/CRM retention tasks**, not purging `audit_logs`. No tenant audit-log purge/retention policy found in API. Treat audit rows as retained until a future job exists.

### Evidence

`activitylog/routes.go`, `auth/permissions.go`, `auth/permission_matrix.go`, seed deny in `121_seed_tenant_defaults.sql` / `provision/seed.go`
