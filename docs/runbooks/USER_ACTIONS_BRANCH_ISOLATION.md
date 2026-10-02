# USER ACTIONS — Multi-branch isolation + Transfer v2

Agent implementation lands with flags **default OFF**. Complete these steps to go live.

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

- Store admin on Branch A cannot open Branch B sales by URL.
- Inv. Balance by Location still shows other-branch qty.
- Foreign movement rows redact commercial `ref_type` / `ref_id`.
- Transfer: Submit → Approve → Ship → Receive (Post blocked).
- Bell toast for owner/store_admin on submit/approve/ship/receive.

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
