package inventory

import "strings"

// Inv.book waits on the job status. On-hand still moves when the scan or finish is saved.
// These three strings are the only job filter. They add no SQL placeholders.
const invBookJobJoinSQL = `
left join public.mfg_work_orders wo
  on sm.ref_type = 'mfg_work_order'
 and wo.id = sm.ref_id
 and wo.tenant_id = sm.tenant_id
left join public.mfg_boms b
  on b.id = wo.bom_id
 and b.tenant_id = wo.tenant_id`

const invBookJobVisibleSQL = `
and (
  coalesce(sm.ref_type, '') <> 'mfg_work_order'
  or (
    wo.id is not null
    and (
      (coalesce(b.bom_type, 'assembly') = 'disassembly' and wo.status = 'completed')
      or (coalesce(b.bom_type, 'assembly') = 'assembly' and wo.status in ('released', 'completed'))
      or coalesce(b.bom_type, 'assembly') not in ('disassembly', 'assembly')
    )
  )
)`

const invBookBookedAtSQL = `
case
  when coalesce(b.bom_type, 'assembly') = 'disassembly'
    then greatest(sm.created_at, coalesce(wo.completed_at, sm.created_at))
  when coalesce(b.bom_type, 'assembly') = 'assembly'
    then greatest(sm.created_at, coalesce(wo.released_at, wo.completed_at, sm.created_at))
  else sm.created_at
end`

// invBookShowsJobMovement is the status rule for a job row that exists.
// Blank bom type follows assembly. Recipe and any other type stay visible.
func invBookShowsJobMovement(bomType, status string) bool {
	bt := strings.TrimSpace(strings.ToLower(bomType))
	if bt == "" {
		bt = "assembly"
	}
	switch bt {
	case "disassembly":
		return status == "completed"
	case "assembly":
		return status == "released" || status == "completed"
	default:
		return true
	}
}

// invBookSlipOpeningSQL is the Beginning Inventory quantity. It uses the same
// job join, visibility rule, and book time as the ledger opening query.
func invBookSlipOpeningSQL(locationID *int64) string {
	loc := ""
	if locationID != nil {
		loc = " and sm.location_id = $4"
	}
	return `
		select coalesce(i.item_code,''), coalesce(i.item_name,''),
		  coalesce((
		    select sum(sm.qty_delta)::float8
		    from public.inv_stock_movements sm
		    ` + invBookJobJoinSQL + `
		    where sm.tenant_id = $1 and sm.item_id = $2
		      and (` + invBookBookedAtSQL + `) < $3::date
		      ` + invBookJobVisibleSQL + loc + `
		  ), 0)
		from public.inv_items i
		where i.id = $2 and i.tenant_id = $1`
}
