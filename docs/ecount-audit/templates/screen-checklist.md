# Screen audit checklist

Copy this template into `screens/{prgId}-{slug}.md` for each program.

## Metadata

- **prgId:**
- **Screen name:**
- **Menu path:**
- **URL hash:**
- **Audited on:**
- **Auditor:**

## Tab pills (required — do this first)

> Every window can have tab pills. Missing a pill = missing fields, validations, or posting rules.  
> Log each pill in `tab-pills.csv` and summarize below.

| Level | Context | Tab label | Default? | Fields / grids on this pill only | Audited |
|-------|---------|-----------|----------|----------------------------------|---------|
| L0 | Module bar | | | | |
| L1 | Left sub-menu | | | | |
| L2 | Screen / Option / Form | | | | |
| L3 | Modal opened from toolbar | | | | |

**Tab pill completion:** `___` / `___` audited (must be 100% before `depth-complete`)

### Tab pill levels to check

- [ ] **L0** — Horizontal module tabs (Setup · Sales · Purchases · …)
- [ ] **L1** — Left navigation under active module tab
- [ ] **L2** — Screen header pills (Default · Qty · Price · …)
- [ ] **L2** — Option/filter designer pills (same pattern, different panel)
- [ ] **L2** — List status pills (All · Unconfirmed · Confirm · e-Approval)
- [ ] **L3** — Tabs inside modals opened from toolbar buttons
- [ ] **L4** — Nested pickers / Excel wizard steps

## Navigation shell

- [ ] Left module menu (active highlight)
- [ ] Setup sub-menu links under module
- [ ] Breadcrumb / page title
- [ ] Help / Option buttons

## Toolbar

| Button | Opens | Has inner tab pills? | Notes |
|--------|-------|----------------------|-------|
| | | yes/no | |

## List / grid

- **Columns:**
- **Default sort:**
- **Pagination:**
- **Multi-select:**
- **Row click behavior:**
- **Column header sort:**
- **Status filter pills:**

## Filters (Option panel)

Document **each Option tab pill** separately (not one blob).

| Option pill | Fields |
|-------------|--------|
| | |

## Forms / modals

| Trigger | Type | Tab pills inside | Key fields | Validations | Posting effect |
|---------|------|------------------|------------|-------------|----------------|
| | | | | | |

## Business rules inferred

- Required fields:
- Code generation:
- Deactivate vs delete:
- Stock / GL impact:
- Permissions:

## Cross-links

| Control | Destination prgId | Purpose |
|---------|-------------------|---------|
| | | |

## Bluearm mapping

| ECount capability | Bluearm route | Gap |
|-------------------|---------------|-----|
| | | |

## Coverage

- Tab pills discovered:
- Tab pills audited:
- Controls found:
- Controls logged:
- Status: `cataloged` | `in-progress` | `depth-complete` (requires 100% tab pills)
