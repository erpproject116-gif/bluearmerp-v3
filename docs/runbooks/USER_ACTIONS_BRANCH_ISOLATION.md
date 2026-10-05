# USER ACTIONS — Multi-branch isolation + Transfer v2

Agent implementation lands with flags **default OFF**. Complete these steps to go live.

## Active-branch view scope (owners / platform)

Independent of `strict_branch_isolation` (works when the flag is **off**):

| Mode | Who | Behavior |
|------|-----|----------|
| **All branches** (default for owners with no stored preference) | Owner / platform / support | No `X-Branch-ID` → company-wide lists |
| **Active branch selected** | Owner / platform / support | `X-Branch-ID` → list/export/picker SQL `location_id = branch` |
| Precedence | Everyone | `?location_id=` **wins over** Active branch |
| GET-by-id | Owners | Still company-wide in v1 (list hide ≠ detail block) |
| GL / TB / P&L / BS / cash flow | Everyone | **Company-wide books**; FE shows honesty banner when a branch is selected |
| POS open session | Cashiers | Uses **session.location_id**, not sidebar Active branch (warn if they differ) |

Hard fence for **non-owners** still requires `strict_branch_isolation` + home/scopes (sections below).

### Coverage matrix (v1)

| Area | List / export | Get-by-id | Notes |
|------|---------------|-----------|--------|
| Sales, SO, Quotation, PR, PO, GR, DR | Via `ApplyUserScopesSQL` | Owner open OK | Wired |
| SI, OR, PV, AR/AP aging | Via datascope | Owner open OK | Wired |
| Serial units, available serials, lot batches | Via datascope | N/A | Operating defaults |
| Stock balance / ledger / ageing / on-hand / inv-book / inventory-status | Via datascope | N/A | Narrows when Active branch set (or `?location_id=`); All branches = multi-location for view-all |
| Stock transfers / in-transit | Handoff v2 rules | — | Do not break |
| Journal / TB / P&L / BS / cash flow | Company-wide | — | Banner only; no fake branch books |
| POS catalog / cart | Session location | — | Sidebar branch ignored in-session |
| RFQ | Via datascope (`location_id`) | N/A | Migration `316_rfq_location_id.sql`; inherit from PR / Active branch / home |

### Residual gaps

- Journal entries lack `location_id` — true branch books need a later epic.
- Some CRM / manufacturing / shipping pickers may omit datascope — audit if leaks appear.
- Owner deep-link to HQ doc while viewing Branch 1 still opens (by design v1).
- Null `location_id` legacy docs (incl. old RFQs) disappear under Active branch filter; visible again under All branches.

## 1. Apply migration

Ensure `312_branch_isolation_transfer_v2.sql` is applied (ECS migration runner or Supabase SQL).

Verify:

```sql
select column_name from information_schema.columns
where table_name = 'users' and column_name = 'home_location_id';

select column_name from information_schema.columns
where table_name = 'tenant_process_policies'
  and column_name in ('strict_branch_isolation', 'transfer_handoff_v2');
```

## 2. Backfill / assign homes

Migration backfills `home_location_id`. Spot-check:

```sql
select id, email, tenant_role, home_location_id
from public.users
where status = 'active' and home_location_id is null
limit 50;
```

Set missing homes in User Management or SQL.

## 3. Pilot enable (one tenant)

```sql
update public.tenant_process_policies
set strict_branch_isolation = true,
    transfer_handoff_v2 = true
where tenant_id = <PILOT_TENANT_ID>;
```

## 4. Deploy

1. Commit + push `main` (if Agent did not).
2. Vercel: wait for web production **READY**.
3. ECS: confirm API deploy workflow success.
4. Health: `https://api.bluearmerp.com/health/schema` → `latest_migration` includes `312_...`.

## 5. Sign-off checklist

- Owner: All branches → company-wide sales; switch to Branch 1 → HQ rows gone; All restores.
- Owner: P&L/TB/BS show company-wide honesty banner when a branch is selected.
- Store admin on Branch A cannot open Branch B sales by URL (isolation ON).
- Stock balance: with Active branch set, defaults to that location; All branches = multi-location.
- Foreign movement rows redact commercial `ref_type` / `ref_id` (isolation).
- Transfer: Submit → Approve → Ship → Receive (Post blocked).
- Bell toast for owner/store_admin on submit/approve/ship/receive.
- POS: open session keeps session location if sidebar branch differs (warn shown).

## 6. Broader rollout

Repeat the `update tenant_process_policies` for each tenant when ready.

## 7. Web Push (F2) — optional

Set on ECS API (and rebuild):

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (optional, default `mailto:ops@bluearmerp.com`)

Set on Vercel web (and rebuild):

- `VITE_VAPID_PUBLIC_KEY` (same public key as API)

Subscriptions table: `user_push_subscriptions`. With keys present, transfer notifications fan out via Web Push and `notificationclick` opens `/app/inventory/stock-entries?focus=<id>`. In-app bell remains the primary ASAP channel if push is declined.

## 8. Do NOT (this feature)

- Do not bulk-enable `daily_ops_enabled` (digest opt-in is a separate ops task).
- Do not force-push or amend published history.

## Enable digests separately (optional)

```sql
update public.owner_change_alert_prefs
set daily_ops_enabled = true, updated_at = now()
where tenant_id = <id>;
```

Confirm ECS crontab calls `POST /api/v1/platform/jobs/daily-ops-digest`.
