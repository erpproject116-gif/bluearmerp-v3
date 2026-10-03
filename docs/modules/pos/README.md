# POS

Retail terminal and shift management.

| Feature | Route |
|---------|-------|
| Terminal | `/app/pos` |
| Manage | `/app/pos/manage` |

**Session statuses:** `open` \| `closed` (migration `082`).

**Permissions:** `pos.terminal`, `pos.manage`

**Cashier shell v2 (flagged):** `pos_cashier_shell_v2` — enable with `localStorage.setItem("pos_cashier_shell_v2","1")` then reload. Runbook: [`docs/runbooks/POS_CASHIER_SHELL_V2.md`](../../runbooks/POS_CASHIER_SHELL_V2.md). Migrations: `314_pos_coin_exchange`, `315_pos_catalog_visible`.

**E2E:** `web/e2e/pos-cashier-shell.spec.ts` — open → add → pay → print path → drawer → close (soft-fails with `needs-seed` when demo catalog/location missing).

**Plain-language playbook:** [Notion pack — POS & HR](../../notion-knowledge-base/modules/08-pos-hr.md) · KB `pos-first-day-register`

**API:** `api/internal/modules/pos/`
