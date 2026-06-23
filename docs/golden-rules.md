# UI golden rules

Project-wide UX conventions for data-heavy screens.

## Data tables and datagrids

All list grids (`SpreadsheetGrid`, line-item grids, search result tables, report tables) must:

1. **Resizable columns** — drag the right edge of a column header to adjust width (min 72px, max 640px by default).
2. **Horizontal scroll** — when total column width exceeds the viewport, the table scrolls horizontally inside `erp-data-table-scroll` (never clip or squash columns below min width).
3. **Subtle cell borders** — all `erp-grid` tables use light grid lines via shared CSS (`web/src/index.css`); do not add per-row `border-b` that duplicates cell borders.
4. **Shared primitives** — use `useResizableColumns`, `DataTableScroll`, `ResizableTh`, and `ResizableTd` from `web/src/shared/` (or extend `SpreadsheetGrid`).

Implementation reference: `web/src/shared/SpreadsheetGrid.tsx`.

## Print preview

Printable document pages (packing slips, quotations, status reports) should use `PrintPreviewTable` from `web/src/shared/PrintPreviewTable.tsx` so users can **resize columns before printing**.

- Wrap line tables in `PrintPreviewTable` with column definitions and `render` callbacks.
- Show a short hint above the print toolbar: *"Drag column edges to resize before printing."*
- `@media print` hides resize handles (`.erp-grid-col-resizer`) via shared CSS.
- Reference: `web/src/modules/sales/sales/PackingSlipPrintPage.tsx`.

## Document autosave

Document entry modals (Sales, Sales Order, Quotation) use `useDocumentDraft` from `web/src/shared/useDocumentDraft.tsx`:

- Debounced `PUT /api/v1/drafts/{entity_type}` (default 1.5s) while the modal is open.
- On reopen, show banner: *"Temporarily saved at {time}. Apply | Delete"*.
- **Apply** restores draft payload into the form; **Delete** clears the server draft.
- **Clear on successful Save** — call `draft.clearOnSave()` after POST/PATCH succeeds.
- Drafts are per-user WIP only; list APIs never return draft data.
- Committed changes still go to `audit_logs` on save.

## Spreadsheet list grids (existing)

- F2 new row · ↑↓ navigate · Enter edit · sortable headers · toolbar search · pagination.
- **+ New row** screens include a **Form settings** cog when `settingsHref` is set.

## Form settings (existing)

Screens with **+ New row** expose form field settings (standard + custom fields, required/disabled).

## Kanban and notification center

### Table ↔ Board toggle

Pipeline pages (Follow-up Tasks, Quotation Pipeline) use `ViewModeToggle` from `web/src/shared/ViewModeToggle.tsx`:

- Segmented control: **Table | Board**
- Persist choice in `localStorage` per page key
- Table view: existing `SpreadsheetGrid` or report table
- Board view: `KanbanBoard` + `KanbanCard` with `@thisbeyond/solid-dnd`

Drag a card to another column → PATCH stage on the API (`/crm/follow-up-tasks/{id}/stage` or quotation progress endpoint).

### Notification bell

- Rendered in `AppShell` when user has `can_view_crm`
- Unread count from CRM notifications API
- Dropdown: last 10 items; link to `/app/crm/notifications`
- Do not duplicate toast notifications for the same CRM alert
