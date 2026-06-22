# UI golden rules

Project-wide UX conventions for data-heavy screens.

## Data tables and datagrids

All list grids (`SpreadsheetGrid`, line-item grids, search result tables, report tables) must:

1. **Resizable columns** — drag the right edge of a column header to adjust width (min 72px, max 640px by default).
2. **Horizontal scroll** — when total column width exceeds the viewport, the table scrolls horizontally inside `erp-data-table-scroll` (never clip or squash columns below min width).
3. **Shared primitives** — use `useResizableColumns`, `DataTableScroll`, `ResizableTh`, and `ResizableTd` from `web/src/shared/` (or extend `SpreadsheetGrid`).

Implementation reference: `web/src/shared/SpreadsheetGrid.tsx`.

## Spreadsheet list grids (existing)

- F2 new row · ↑↓ navigate · Enter edit · sortable headers · toolbar search · pagination.
- **+ New row** screens include a **Form settings** cog when `settingsHref` is set.

## Form settings (existing)

Screens with **+ New row** expose form field settings (standard + custom fields, required/disabled).
