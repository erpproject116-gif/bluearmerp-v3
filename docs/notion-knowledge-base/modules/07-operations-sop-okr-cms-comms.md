# Module — Operations, SOP, OKR, CMS, Comms

## Project Management (`operations`)

**Path:** `/app/operations`  
**Purpose:** Workspaces / Kanban work items linked to ERP documents; job costing; automation.

### Features

Work hub · Industry packs · Calendar · Timeline · Project dashboard · Tasks dashboard · Job costing · Automation

### Statuses (G-17 closed)

| Entity | Values | Evidence |
|--------|--------|----------|
| Workspace | `active` \| `archived` | migration `140` |
| Work item | `open` \| `in_progress` \| `done` \| `blocked` | migration `140` |
| Priority | `low` \| `normal` \| `high` \| `urgent` | migration `140` |

Tasks dashboard treats `status <> 'done'` as open work.

### Document link types (Observed)

quotation · PO · Sales · Official Receipt · job cost project

### Automation triggers (Observed)

work_item created · column_changed · status_changed · quotation_created

### Happy path

1. Open Work hub / pick industry pack.  
2. Move cards; link or create quotation from work item.  
3. Use Job costing for budgets/timesheets (not Inventory → Projects).  
4. Optional automation rules.

### Proven

S11 (`demo-riverside-reno`).

### Evidence

`docs/modules/operations/README.md`, `api/migrations/140_operations_hub.sql`, `api/internal/modules/operations/`

---

## SOP

**Path:** `/app/sop`  
**Features:** Library · Dashboard  

### Statuses (Observed)

`draft` | `published` | `archived` — publish bumps version; “stale” when published + review rules  

### Evidence

`api/internal/modules/sop/`, migration `212_sop_module.sql`

### SOP / OKR help (G-32 closed)

In-app sections `sop` and `okr` exist in `documentationSections.ts` and are listed under the **CRM & service** help group. READMEs: `docs/modules/sop/README.md`, `docs/modules/okr/README.md`.

---

## OKRs

**Path:** `/app/okr`  
**Features:** Objectives · Dashboard  

### Statuses (Observed)

Create default `active`. DB check (migration `213`): `active` \| `completed` \| `cancelled`. Progress from key results (manual).

### Evidence

`api/internal/modules/okr/`, migration `213_okr_module.sql`

---

## Pages (`cms`)

**Path:** `/app/cms`  
**Features:** Pages · Articles (`/articles`) · Media · Redirects  

### Statuses (Observed)

`draft` → Publish → `published`; Unpublish → `draft`; Archive → `archived`

### Gates

- `cms.pages_publish` for publish/unpublish/archive; owners always  
- Publish saves body then publishes; stale `updated_at` → 409  
- Public catalog tenant constrained (`CMS_PUBLIC_TENANT_CODE` / BLUEARM)

### Evidence

`docs/modules/cms/README.md` (strong)

---

## Communications (`comms`)

**Path:** `/app/comms/chat`  
**Features:** Team Chat · Inbox · Sent Documents · Settings  

### Behavior

- Email saved docs (`comms.send`) → enqueue sent messages → Gmail/SMTP  
- Share to chat on quotation / SO / sales / PO  
- Does **not** change commercial voucher status by itself  

### Proven

S12 (`DEMO-COMMS-*`).

### Evidence

`docs/modules/comms/README.md`, `api/internal/platform/comms/`
