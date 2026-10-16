package notify

import (
	"context"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/branchiso"
)

func isHandoffAction(actionCode string) bool {
	switch strings.TrimSpace(actionCode) {
	case "quotation.create",
		"sales_order.create",
		"sales_order.create_from_quotation",
		"sales.create",
		"sales.create_from_sales_order",
		"purchase_request.create",
		"purchase_request.create_from_sales_order",
		"purchase_order.rfq_create",
		"purchase_order.rfq_create_from_pr",
		"purchase_order.create",
		"purchase_order.create_from_pr",
		"purchase_order.create_from_supplier_quotation",
		"goods_receipt.create",
		"finance.supplier_invoice.create",
		"finance.supplier_invoice.create_from_gr",
		"manufacturing.work_order_create",
		"manufacturing.work_order_create_from_sales_order":
		return true
	default:
		return false
	}
}

func handoffPermissionCodes(actionCode string) []string {
	switch strings.TrimSpace(actionCode) {
	case "quotation.create":
		return []string{"quotation", "quotation.quotations"}
	case "sales_order.create", "sales_order.create_from_quotation":
		return []string{"sales_order", "sales_order.sales_orders"}
	case "sales.create", "sales.create_from_sales_order":
		return []string{"sales", "sales.sales"}
	case "purchase_request.create", "purchase_request.create_from_sales_order":
		return []string{"purchase_request.purchase_requests"}
	case "purchase_order.rfq_create", "purchase_order.rfq_create_from_pr":
		return []string{"purchase_order.rfq", "purchase_order.purchase_orders"}
	case "purchase_order.create", "purchase_order.create_from_pr", "purchase_order.create_from_supplier_quotation":
		return []string{"purchase_order.purchase_orders", "purchase_order.purchase_orders_from_quote"}
	case "goods_receipt.create":
		return []string{"purchase_order.goods_receipts", "purchases.purchases"}
	case "finance.supplier_invoice.create", "finance.supplier_invoice.create_from_gr":
		return []string{"purchases.purchases", "purchases.purchases_new"}
	case "manufacturing.work_order_create", "manufacturing.work_order_create_from_sales_order":
		return []string{"manufacturing.work_orders"}
	default:
		return nil
	}
}

func handoffTitle(actionCode, ref string) string {
	label := "New document"
	switch {
	case strings.HasPrefix(actionCode, "quotation."):
		label = "New quotation"
	case strings.HasPrefix(actionCode, "sales_order."):
		label = "New sales order"
	case strings.HasPrefix(actionCode, "sales."):
		label = "New sale"
	case strings.HasPrefix(actionCode, "purchase_request."):
		label = "New purchase request"
	case strings.Contains(actionCode, "rfq_create"):
		label = "New RFQ"
	case strings.HasPrefix(actionCode, "goods_receipt."):
		label = "New purchase receive"
	case strings.Contains(actionCode, "supplier_invoice"):
		label = "New purchase"
	case strings.HasPrefix(actionCode, "purchase_order."):
		label = "New purchase order"
	case strings.HasPrefix(actionCode, "manufacturing."):
		label = "New production job"
	}
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return label
	}
	return label + " " + ref
}

type handoffCandidate struct {
	ID             int64
	Unscoped       bool
	ViewAll        bool
	HomeLocationID int64
	CustomerIDs    []int64
	LocationIDs    []int64
	ScopeLookupOK  bool
}

type handoffDocScope struct {
	PartnerID  *int64
	LocationID *int64
	Loaded     bool
}

// keepHandoffRecipient applies job scope and strict branch isolation.
// A failed scope lookup drops the user. View-all (owner) is not scope-filtered.
func keepHandoffRecipient(u handoffCandidate, doc handoffDocScope, isolation bool) bool {
	if u.ViewAll {
		return true
	}
	if !u.ScopeLookupOK || !doc.Loaded {
		return false
	}
	if isolation && !handoffLocationAllowed(u, doc.LocationID) {
		return false
	}
	if u.Unscoped {
		return true
	}
	if len(u.CustomerIDs) == 0 && len(u.LocationIDs) == 0 {
		return false
	}
	if doc.PartnerID != nil && *doc.PartnerID > 0 && len(u.CustomerIDs) > 0 && !containsInt64(u.CustomerIDs, *doc.PartnerID) {
		return false
	}
	if doc.LocationID != nil && *doc.LocationID > 0 && len(u.LocationIDs) > 0 && !containsInt64(u.LocationIDs, *doc.LocationID) {
		return false
	}
	return true
}

func handoffLocationAllowed(u handoffCandidate, locationID *int64) bool {
	if locationID == nil || *locationID <= 0 {
		return false
	}
	allowed := map[int64]struct{}{}
	if u.HomeLocationID > 0 {
		allowed[u.HomeLocationID] = struct{}{}
	}
	for _, id := range u.LocationIDs {
		if id > 0 {
			allowed[id] = struct{}{}
		}
	}
	if len(allowed) == 0 {
		return false
	}
	_, ok := allowed[*locationID]
	return ok
}

func containsInt64(ids []int64, want int64) bool {
	for _, id := range ids {
		if id == want {
			return true
		}
	}
	return false
}

type handoffDocFacts struct {
	Ref        string
	PartnerID  *int64
	LocationID *int64
	PICs       []int64
	Loaded     bool
}

func loadHandoffDoc(ctx context.Context, pool *pgxpool.Pool, tenantID int64, targetType string, targetID *int64) handoffDocFacts {
	if pool == nil || targetID == nil || *targetID <= 0 {
		return handoffDocFacts{}
	}
	id := *targetID
	var facts handoffDocFacts
	var err error
	switch strings.TrimSpace(targetType) {
	case "quo_quotation", "quotation":
		err = scanHandoff(ctx, pool, &facts, `
			select coalesce(nullif(trim(reference_no), ''), id::text), partner_id, location_id, pic_user_id, null::bigint
			from public.quo_quotations where id = $1 and tenant_id = $2`, id, tenantID)
	case "so_sales_order", "sa_sales_order", "sales_order":
		err = scanHandoff(ctx, pool, &facts, `
			select coalesce(nullif(trim(sales_order_no), ''), id::text), partner_id, location_id, pic_user_id, sales_person_id
			from public.so_sales_orders where id = $1 and tenant_id = $2`, id, tenantID)
	case "sa_sales", "sa_sale", "sales":
		err = scanHandoff(ctx, pool, &facts, `
			select coalesce(nullif(trim(sales_no), ''), id::text), partner_id, location_id, pic_user_id, null::bigint
			from public.sa_sales where id = $1 and tenant_id = $2`, id, tenantID)
	case "pr_purchase_request", "purchase_request":
		err = scanHandoff(ctx, pool, &facts, `
			select coalesce(nullif(trim(purchase_request_no), ''), id::text), partner_id, location_id, pic_user_id, null::bigint
			from public.pr_purchase_requests where id = $1 and tenant_id = $2`, id, tenantID)
	case "rfq_request":
		err = scanHandoff(ctx, pool, &facts, `
			select coalesce(nullif(trim(rfq_no), ''), id::text), null::bigint, location_id, null::bigint, null::bigint
			from public.rfq_requests where id = $1 and tenant_id = $2`, id, tenantID)
	case "po_purchase_order", "purchase_order":
		err = scanHandoff(ctx, pool, &facts, `
			select coalesce(nullif(trim(purchase_order_no), ''), id::text), partner_id, location_id, pic_user_id, null::bigint
			from public.po_purchase_orders where id = $1 and tenant_id = $2`, id, tenantID)
	case "gr_goods_receipt":
		err = scanHandoff(ctx, pool, &facts, `
			select coalesce(nullif(trim(gr.reference), ''), gr.id::text), po.partner_id, gr.location_id, null::bigint, null::bigint
			from public.gr_goods_receipts gr
			left join public.po_purchase_orders po on po.id = gr.purchase_order_id
			where gr.id = $1 and gr.tenant_id = $2`, id, tenantID)
	case "fin_supplier_invoice", "supplier_invoice", "purchase":
		err = scanHandoff(ctx, pool, &facts, `
			select coalesce(nullif(trim(invoice_no), ''), id::text), partner_id, location_id, pic_user_id, null::bigint
			from public.fin_supplier_invoices where id = $1 and tenant_id = $2`, id, tenantID)
	case "mfg_work_order":
		err = scanHandoff(ctx, pool, &facts, `
			select coalesce(nullif(trim(work_order_no), ''), id::text), null::bigint, location_id, null::bigint, null::bigint
			from public.mfg_work_orders where id = $1 and tenant_id = $2`, id, tenantID)
	default:
		return handoffDocFacts{}
	}
	if err != nil {
		return handoffDocFacts{}
	}
	facts.Loaded = true
	return facts
}

func scanHandoff(ctx context.Context, pool *pgxpool.Pool, facts *handoffDocFacts, sql string, id, tenantID int64) error {
	var partner, location, pic, salesPerson *int64
	err := pool.QueryRow(ctx, sql, id, tenantID).Scan(&facts.Ref, &partner, &location, &pic, &salesPerson)
	if err != nil {
		return err
	}
	facts.PartnerID = positiveID(partner)
	facts.LocationID = positiveID(location)
	if id := positiveID(pic); id != nil {
		facts.PICs = append(facts.PICs, *id)
	}
	if id := positiveID(salesPerson); id != nil {
		facts.PICs = append(facts.PICs, *id)
	}
	return nil
}

func positiveID(id *int64) *int64 {
	if id == nil || *id <= 0 {
		return nil
	}
	return id
}

func handoffAudienceUserIDs(ctx context.Context, pool *pgxpool.Pool, tenantID, actorUserID int64, actionCode, targetType string, targetID *int64) []int64 {
	perms := handoffPermissionCodes(actionCode)
	if len(perms) == 0 || pool == nil {
		return nil
	}
	type row struct {
		id       int64
		unscoped bool
	}
	var matched []row
	rows, err := pool.Query(ctx, `
		select u.id, bool_or(not coalesce(tr.apply_user_scopes, false))
		from public.users u
		join public.tenant_user_roles tur on tur.user_id = u.id and tur.tenant_id = $1
		join public.tenant_role_permissions trp
		  on trp.tenant_id = tur.tenant_id and trp.role_code = tur.role_code
		left join public.tenant_roles tr
		  on tr.tenant_id = tur.tenant_id and tr.role_code = tur.role_code and tr.is_active = true
		where u.tenant_id = $1 and u.status = 'active'
		  and trp.permission_code = any($2::text[])
		  and trp.access_level in ('read', 'write')
		group by u.id`, tenantID, perms)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var r row
			if rows.Scan(&r.id, &r.unscoped) == nil && r.id > 0 && r.id != actorUserID {
				matched = append(matched, r)
			}
		}
		err = rows.Err()
	}
	if err != nil {
		matched = nil
	}

	var ownerID int64
	_ = pool.QueryRow(ctx, `select coalesce(owner_user_id, 0) from public.tenants where id = $1`, tenantID).Scan(&ownerID)

	doc := loadHandoffDoc(ctx, pool, tenantID, targetType, targetID)
	isolation := false
	if flags, flagErr := branchiso.LoadFlags(ctx, pool, tenantID); flagErr == nil {
		isolation = flags.StrictBranchIsolation
	} else {
		isolation = true
	}

	ids := make([]int64, 0, len(matched)+1)
	for _, m := range matched {
		ids = append(ids, m.id)
	}
	if ownerID > 0 && ownerID != actorUserID {
		ids = append(ids, ownerID)
	}
	profiles, profErr := loadHandoffProfiles(ctx, pool, tenantID, ids)
	if profErr != nil {
		if ownerID > 0 && ownerID != actorUserID {
			return []int64{ownerID}
		}
		return nil
	}

	docScope := handoffDocScope{PartnerID: doc.PartnerID, LocationID: doc.LocationID, Loaded: doc.Loaded}
	seen := map[int64]struct{}{}
	var out []int64
	add := func(id int64) {
		if id <= 0 || id == actorUserID {
			return
		}
		if _, ok := seen[id]; ok {
			return
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	for _, m := range matched {
		p, ok := profiles[m.id]
		if !ok {
			continue
		}
		p.Unscoped = m.unscoped
		p.ViewAll = p.ViewAll || m.id == ownerID
		if keepHandoffRecipient(p, docScope, isolation) {
			add(m.id)
		}
	}
	if ownerID > 0 && ownerID != actorUserID {
		add(ownerID)
	}
	if doc.Loaded {
		for _, pic := range doc.PICs {
			add(pic)
		}
	}
	return out
}

func loadHandoffProfiles(ctx context.Context, pool *pgxpool.Pool, tenantID int64, ids []int64) (map[int64]handoffCandidate, error) {
	out := map[int64]handoffCandidate{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := pool.Query(ctx, `
		select u.id,
		  coalesce(u.home_location_id, 0),
		  (t.owner_user_id = u.id),
		  exists (
		    select 1 from public.platform_users pu
		    where pu.auth_user_id = u.auth_user_id
		      and coalesce(pu.is_active, false)
		      and pu.role = 'superadmin'
		  )
		from public.users u
		join public.tenants t on t.id = u.tenant_id
		where u.tenant_id = $1 and u.id = any($2::bigint[])`, tenantID, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var c handoffCandidate
		var owner, platform bool
		if err := rows.Scan(&c.ID, &c.HomeLocationID, &owner, &platform); err != nil {
			return nil, err
		}
		c.ViewAll = owner || platform
		c.ScopeLookupOK = true
		out[c.ID] = c
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	scopeRows, err := pool.Query(ctx, `
		select user_id, scope_type, record_id
		from public.user_data_scopes
		where tenant_id = $1 and user_id = any($2::bigint[])`, tenantID, ids)
	if err != nil {
		return nil, err
	}
	defer scopeRows.Close()
	for scopeRows.Next() {
		var userID, recordID int64
		var scopeType string
		if err := scopeRows.Scan(&userID, &scopeType, &recordID); err != nil {
			return nil, err
		}
		c := out[userID]
		c.ID = userID
		c.ScopeLookupOK = true
		switch scopeType {
		case "customer":
			c.CustomerIDs = append(c.CustomerIDs, recordID)
		case "location", "warehouse":
			c.LocationIDs = append(c.LocationIDs, recordID)
		}
		out[userID] = c
	}
	if err := scopeRows.Err(); err != nil {
		return nil, err
	}
	for id, c := range out {
		if c.ID == 0 {
			c.ID = id
			c.ScopeLookupOK = true
			out[id] = c
		}
	}
	return out, nil
}
