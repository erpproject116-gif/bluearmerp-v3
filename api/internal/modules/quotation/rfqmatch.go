package quotation

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type rfqItemCandidate struct {
	ID         int64   `json:"item_id"`
	Code       string  `json:"item_code"`
	Name       string  `json:"item_name"`
	SalesPrice float64 `json:"sales_price"`
	Score      float64 `json:"match_score"`
}

func lookupRfqItemCandidates(ctx context.Context, pool *pgxpool.Pool, tenantID int64, ln ParsedRfqLine, limit int) []rfqItemCandidate {
	if limit <= 0 {
		limit = 3
	}
	seen := map[int64]struct{}{}
	var out []rfqItemCandidate

	add := func(hit *rfqItemHit, score float64) {
		if hit == nil {
			return
		}
		if _, ok := seen[hit.ID]; ok {
			return
		}
		seen[hit.ID] = struct{}{}
		out = append(out, rfqItemCandidate{
			ID: hit.ID, Code: hit.Code, Name: hit.Name, SalesPrice: hit.SalesPrice, Score: score,
		})
	}

	if hit, score := lookupRfqItem(ctx, pool, tenantID, ln); hit != nil {
		add(hit, score)
	}

	code := ln.ItemCode
	desc := ln.Description
	if len(out) < limit && code != "" {
		rows, err := pool.Query(ctx, `
			select id, item_code, item_name, coalesce(sales_price, 0)
			from public.inv_items
			where tenant_id = $1 and deleted_at is null
			  and (item_code ilike $2 or item_name ilike $2)
			order by
			  case when lower(item_code) = lower($3) then 0 else 1 end,
			  length(item_code)
			limit 8`, tenantID, "%"+code+"%", code)
		if err == nil {
			for rows.Next() {
				var hit rfqItemHit
				if rows.Scan(&hit.ID, &hit.Code, &hit.Name, &hit.SalesPrice) == nil {
					add(&hit, 0.75)
				}
				if len(out) >= limit {
					break
				}
			}
			rows.Close()
		}
	}
	if len(out) < limit && desc != "" {
		tok := firstSignificantToken(desc)
		q := "%" + desc + "%"
		if tok != "" {
			q = "%" + tok + "%"
		}
		rows, err := pool.Query(ctx, `
			select id, item_code, item_name, coalesce(sales_price, 0)
			from public.inv_items
			where tenant_id = $1 and deleted_at is null
			  and (item_name ilike $2 or item_code ilike $2)
			order by length(item_name)
			limit 8`, tenantID, q)
		if err == nil {
			for rows.Next() {
				var hit rfqItemHit
				if rows.Scan(&hit.ID, &hit.Code, &hit.Name, &hit.SalesPrice) == nil {
					add(&hit, 0.6)
				}
				if len(out) >= limit {
					break
				}
			}
			rows.Close()
		}
	}
	return out
}
