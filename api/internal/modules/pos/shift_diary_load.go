package pos

import (
	"context"
	"fmt"
	"sort"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func loadSessionActivity(ctx context.Context, pool *pgxpool.Pool, sessionID int64, limit int) ([]SessionActivityEvent, error) {
	var events []SessionActivityEvent

	srows, err := pool.Query(ctx, `
		select distinct on (s.id)
		  s.id, s.sales_no, s.grand_total::float8, s.created_at::text,
		  s.deleted_at is not null,
		  coalesce((
		    select string_agg(distinct t2.tender_type, '+')
		    from public.pos_tenders t2 where t2.sales_id = s.id
		  ), '')
		from public.pos_tenders t
		join public.sa_sales s on s.id = t.sales_id
		where t.session_id = $1
		order by s.id, s.created_at desc`, sessionID)
	if err != nil {
		return nil, err
	}
	for srows.Next() {
		var sid int64
		var no, at, tender string
		var total float64
		var voided bool
		if err := srows.Scan(&sid, &no, &total, &at, &voided, &tender); err != nil {
			srows.Close()
			return nil, err
		}
		kind := "sale"
		if voided {
			kind = "void"
		}
		id := sid
		events = append(events, SessionActivityEvent{
			Kind:    kind,
			At:      at,
			SalesNo: no,
			SalesID: &id,
			Amount:  roundMoney(total),
			Label:   no,
			Tender:  tender,
			Voided:  voided,
		})
	}
	srows.Close()
	if err := srows.Err(); err != nil {
		return nil, err
	}

	crows, err := pool.Query(ctx, `
		select movement_type, amount::float8, coalesce(reason,''), created_at::text
		from public.pos_cash_movements
		where session_id = $1
		order by created_at desc`, sessionID)
	if err != nil {
		return nil, err
	}
	for crows.Next() {
		var mt, reason, at string
		var amt float64
		if err := crows.Scan(&mt, &amt, &reason, &at); err != nil {
			crows.Close()
			return nil, err
		}
		kind := "cash_" + mt
		if mt == "coin_exchange" {
			kind = "coin_exchange"
		} else if mt == "in" {
			kind = "cash_in"
		} else if mt == "out" {
			kind = "cash_out"
		}
		label := reason
		if label == "" {
			switch kind {
			case "cash_in":
				label = "Cash in"
			case "cash_out":
				label = "Cash out"
			default:
				label = "Coin exchange"
			}
		}
		events = append(events, SessionActivityEvent{
			Kind:   kind,
			At:     at,
			Amount: roundMoney(amt),
			Label:  label,
		})
	}
	crows.Close()
	if err := crows.Err(); err != nil {
		return nil, err
	}

	sort.Slice(events, func(i, j int) bool {
		return events[i].At > events[j].At
	})
	if limit > 0 && len(events) > limit {
		events = events[:limit]
	}
	if events == nil {
		events = []SessionActivityEvent{}
	}
	return events, nil
}

func buildZReport(ctx context.Context, pool *pgxpool.Pool, tenantID, sessionID int64) (ZReport, error) {
	var out ZReport
	out.TendersByType = map[string]float64{}
	out.GeneratedAt = time.Now().UTC().Format(time.RFC3339)

	var closing *float64
	var closed *string
	err := pool.QueryRow(ctx, `
		select s.session_no, s.status, s.opening_cash::float8, s.sales_total::float8, s.closing_cash::float8,
		  s.opened_at::text, s.closed_at::text,
		  coalesce(l.location_name,''), coalesce(u.full_name,'')
		from public.pos_sessions s
		left join public.inv_locations l on l.id = s.location_id
		left join public.users u on u.id = s.cashier_user_id
		where s.id = $1 and s.tenant_id = $2`, sessionID, tenantID).Scan(
		&out.SessionNo, &out.Status, &out.OpeningCash, &out.SalesTotal, &closing,
		&out.OpenedAt, &closed, &out.LocationName, &out.CashierName)
	if err != nil {
		return out, err
	}
	out.ClosingCash = closing
	out.ClosedAt = closed

	trows, err := pool.Query(ctx, `
		select t.tender_type, sum(t.amount)::float8
		from public.pos_tenders t
		join public.sa_sales s on s.id = t.sales_id and s.deleted_at is null
		where t.session_id = $1
		group by t.tender_type`, sessionID)
	if err != nil {
		return out, err
	}
	for trows.Next() {
		var t string
		var amt float64
		if err := trows.Scan(&t, &amt); err != nil {
			trows.Close()
			return out, err
		}
		out.TendersByType[t] = roundMoney(amt)
	}
	trows.Close()

	crows, err := pool.Query(ctx, `
		select movement_type, sum(amount)::float8
		from public.pos_cash_movements where session_id = $1
		group by movement_type`, sessionID)
	if err != nil {
		return out, err
	}
	for crows.Next() {
		var mt string
		var amt float64
		if err := crows.Scan(&mt, &amt); err != nil {
			crows.Close()
			return out, err
		}
		switch mt {
		case "in":
			out.CashIn = roundMoney(amt)
		case "out":
			out.CashOut = roundMoney(amt)
		case "coin_exchange":
			out.CoinExchange = roundMoney(amt)
		}
	}
	crows.Close()
	out.ExpectedCash = computeExpectedCash(out.OpeningCash, out.TendersByType["cash"], out.CashIn, out.CashOut)
	if closing != nil {
		v := roundMoney(*closing - out.ExpectedCash)
		out.Variance = &v
	}

	txRows, err := pool.Query(ctx, `
		select s.id, s.sales_no, s.grand_total::float8, s.created_at::text, s.deleted_at is not null
		from public.pos_tenders t
		join public.sa_sales s on s.id = t.sales_id
		where t.session_id = $1
		group by s.id, s.sales_no, s.grand_total, s.created_at, s.deleted_at
		order by s.created_at`, sessionID)
	if err != nil {
		return out, err
	}
	for txRows.Next() {
		var txn ShiftTxn
		txn.Tenders = map[string]float64{}
		if err := txRows.Scan(&txn.SalesID, &txn.SalesNo, &txn.GrandTotal, &txn.At, &txn.Voided); err != nil {
			txRows.Close()
			return out, err
		}
		txn.GrandTotal = roundMoney(txn.GrandTotal)
		out.Transactions = append(out.Transactions, txn)
		if txn.Voided {
			out.VoidCount++
		} else {
			out.TxnCount++
		}
	}
	txRows.Close()
	if out.Transactions == nil {
		out.Transactions = []ShiftTxn{}
	}

	for i := range out.Transactions {
		tr, err := pool.Query(ctx, `
			select tender_type, sum(amount)::float8
			from public.pos_tenders where sales_id = $1 and session_id = $2
			group by tender_type`, out.Transactions[i].SalesID, sessionID)
		if err != nil {
			continue
		}
		for tr.Next() {
			var tt string
			var amt float64
			if err := tr.Scan(&tt, &amt); err == nil {
				out.Transactions[i].Tenders[tt] = roundMoney(amt)
			}
		}
		tr.Close()
	}

	mrows, err := pool.Query(ctx, `
		select m.id, m.movement_type, m.amount::float8, coalesce(m.reason,''), m.created_at::text,
		  coalesce(u.full_name,'')
		from public.pos_cash_movements m
		left join public.users u on u.id = m.created_by_user_id
		where m.session_id = $1
		order by m.created_at`, sessionID)
	if err != nil {
		return out, err
	}
	for mrows.Next() {
		var m CashMovement
		if err := mrows.Scan(&m.ID, &m.MovementType, &m.Amount, &m.Reason, &m.CreatedAt, &m.ActorName); err != nil {
			mrows.Close()
			return out, err
		}
		out.CashMovements = append(out.CashMovements, m)
	}
	mrows.Close()
	if out.CashMovements == nil {
		out.CashMovements = []CashMovement{}
	}
	return out, nil
}

func buildDailyRollup(ctx context.Context, pool *pgxpool.Pool, tenantID int64, day time.Time, locID *int64) (DailyRollup, error) {
	out := DailyRollup{
		Date:          day.Format("2006-01-02"),
		LocationID:    locID,
		TendersByType: map[string]float64{},
		Sessions:      []DailySessionRow{},
		GeneratedAt:   time.Now().UTC().Format(time.RFC3339),
	}
	start := time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, time.UTC)
	end := start.Add(24 * time.Hour)

	args := []any{tenantID, start, end}
	where := `s.tenant_id = $1 and s.opened_at >= $2 and s.opened_at < $3`
	if locID != nil {
		where += ` and s.location_id = $4`
		args = append(args, *locID)
		_ = pool.QueryRow(ctx, `select coalesce(location_name,'') from public.inv_locations where id = $1`, *locID).Scan(&out.LocationName)
	}

	q := fmt.Sprintf(`
		select s.id, s.session_no, coalesce(l.location_name,''), coalesce(u.full_name,''),
		  s.status, s.opening_cash::float8, s.sales_total::float8, s.closing_cash::float8
		from public.pos_sessions s
		left join public.inv_locations l on l.id = s.location_id
		left join public.users u on u.id = s.cashier_user_id
		where %s
		order by s.opened_at`, where)
	rows, err := pool.Query(ctx, q, args...)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var row DailySessionRow
		if err := rows.Scan(&row.SessionID, &row.SessionNo, &row.LocationName, &row.CashierName,
			&row.Status, &row.OpeningCash, &row.SalesTotal, &row.ClosingCash); err != nil {
			return out, err
		}
		// Per-session expected cash + txn counts
		var cashIn, cashOut, cashTenders float64
		_ = pool.QueryRow(ctx, `
			select coalesce(sum(amount) filter (where movement_type='in'),0)::float8,
			       coalesce(sum(amount) filter (where movement_type='out'),0)::float8,
			       coalesce(sum(amount) filter (where movement_type='coin_exchange'),0)::float8
			from public.pos_cash_movements where session_id = $1`, row.SessionID).
			Scan(&cashIn, &cashOut, new(float64))
		_ = pool.QueryRow(ctx, `
			select coalesce(sum(t.amount),0)::float8
			from public.pos_tenders t
			join public.sa_sales s on s.id = t.sales_id and s.deleted_at is null
			where t.session_id = $1 and t.tender_type = 'cash'`, row.SessionID).Scan(&cashTenders)
		row.ExpectedCash = computeExpectedCash(row.OpeningCash, cashTenders, cashIn, cashOut)
		if row.ClosingCash != nil {
			v := roundMoney(*row.ClosingCash - row.ExpectedCash)
			row.Variance = &v
		}
		var voidN int
		_ = pool.QueryRow(ctx, `
			select count(distinct s.id) filter (where s.deleted_at is null),
			       count(distinct s.id) filter (where s.deleted_at is not null)
			from public.pos_tenders t
			join public.sa_sales s on s.id = t.sales_id
			where t.session_id = $1`, row.SessionID).Scan(&row.TxnCount, &voidN)
		out.VoidCount += voidN

		out.Sessions = append(out.Sessions, row)
		out.SessionCount++
		out.SalesTotal = roundMoney(out.SalesTotal + row.SalesTotal)
		out.TxnCount += row.TxnCount
		out.CashIn = roundMoney(out.CashIn + cashIn)
		out.CashOut = roundMoney(out.CashOut + cashOut)
	}

	// Aggregate tenders for the day across those sessions
	targs := []any{tenantID, start, end}
	twhere := `ps.tenant_id = $1 and ps.opened_at >= $2 and ps.opened_at < $3`
	if locID != nil {
		twhere += ` and ps.location_id = $4`
		targs = append(targs, *locID)
	}
	tq := fmt.Sprintf(`
		select t.tender_type, sum(t.amount)::float8
		from public.pos_tenders t
		join public.pos_sessions ps on ps.id = t.session_id
		join public.sa_sales s on s.id = t.sales_id and s.deleted_at is null
		where %s
		group by t.tender_type`, twhere)
	trows, err := pool.Query(ctx, tq, targs...)
	if err == nil {
		for trows.Next() {
			var tt string
			var amt float64
			if err := trows.Scan(&tt, &amt); err == nil {
				out.TendersByType[tt] = roundMoney(amt)
				if tt == "cash" {
					out.CashTenders = roundMoney(amt)
				}
			}
		}
		trows.Close()
	}

	_ = pool.QueryRow(ctx, fmt.Sprintf(`
		select coalesce(sum(m.amount) filter (where m.movement_type='coin_exchange'),0)::float8
		from public.pos_sessions ps
		left join public.pos_cash_movements m on m.session_id = ps.id
		where %s`, twhere), targs...).Scan(&out.CoinExchange)

	out.SalesTotal = roundMoney(out.SalesTotal)
	out.CoinExchange = roundMoney(out.CoinExchange)
	return out, nil
}
