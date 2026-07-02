package pos

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type HeldLine struct {
	ItemID    int64              `json:"item_id"`
	ItemCode  string             `json:"item_code"`
	ItemName  string             `json:"item_name"`
	Qty       float64            `json:"qty"`
	UnitPrice float64            `json:"unit_price"`
	Notes     *string            `json:"notes,omitempty"`
	SizeLabel *string            `json:"size_label,omitempty"`
	Modifiers []CartLineModifier `json:"modifiers,omitempty"`
}

type HeldOrder struct {
	ID        int64      `json:"id"`
	Label     string     `json:"label"`
	OrderType string     `json:"order_type"`
	Lines     []HeldLine `json:"lines"`
	LineCount int        `json:"line_count"`
	Total     float64    `json:"total"`
	CreatedAt string     `json:"created_at"`
}

type holdBody struct {
	Label     string `json:"label"`
	OrderType string `json:"order_type"`
}

type cashMovementBody struct {
	MovementType string  `json:"movement_type"`
	Amount       float64 `json:"amount"`
	Reason       string  `json:"reason"`
}

type SessionReport struct {
	SessionNo    string             `json:"session_no"`
	Status       string             `json:"status"`
	OpeningCash  float64            `json:"opening_cash"`
	SalesTotal   float64            `json:"sales_total"`
	TendersByType map[string]float64 `json:"tenders_by_type"`
	CashIn       float64            `json:"cash_in"`
	CashOut      float64            `json:"cash_out"`
	ExpectedCash float64            `json:"expected_cash"`
}

func registerOpsRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("pos.checkout", auth.AccessWrite)).Post("/sessions/{id}/hold", holdCart(pool))
	r.Get("/held-orders", listHeldOrders(pool))
	r.With(auth.RequirePermission("pos.checkout", auth.AccessWrite)).Post("/held-orders/{id}/resume", resumeHeldOrder(pool))
	r.With(auth.RequirePermission("pos.checkout", auth.AccessWrite)).Delete("/held-orders/{id}", deleteHeldOrder(pool))
	r.With(auth.RequirePermission("pos.checkout", auth.AccessWrite)).Post("/sessions/{id}/cash-movements", addCashMovement(pool))
	r.Get("/sessions/{id}/report", sessionReport(pool))
	r.With(auth.RequirePermission("pos.manage", auth.AccessRead)).Get("/logs", listPosLogs(pool))
}

func holdCart(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		sessionID, err := parseID(chi.URLParam(r, "id"))
		if err != nil || !sessionOpen(r.Context(), pool, tu.TenantID, sessionID) {
			response.Validation(w, map[string]string{"session": "Open session required."})
			return
		}
		var body holdBody
		_ = json.NewDecoder(r.Body).Decode(&body)
		lines, err := loadCartLines(r.Context(), pool, sessionID)
		if err != nil || len(lines) == 0 {
			response.Validation(w, map[string]string{"cart": "Cart is empty."})
			return
		}
		held := make([]HeldLine, 0, len(lines))
		for _, ln := range lines {
			held = append(held, HeldLine{
				ItemID: ln.ItemID, ItemCode: ln.ItemCode, ItemName: ln.ItemName,
				Qty: ln.Qty, UnitPrice: ln.UnitPrice, Notes: ln.Notes, SizeLabel: ln.SizeLabel, Modifiers: ln.Modifiers,
			})
		}
		payload, _ := json.Marshal(held)
		orderType := strings.TrimSpace(body.OrderType)
		if orderType == "" {
			orderType = "dine_in"
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to hold order.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		var id int64
		if err := tx.QueryRow(r.Context(), `
			insert into public.pos_held_orders (tenant_id, session_id, label, order_type, payload, created_by_user_id)
			values ($1,$2,$3,$4,$5,$6) returning id`,
			tu.TenantID, sessionID, strings.TrimSpace(body.Label), orderType, payload, tu.AppUserID).Scan(&id); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to hold order.", "ERR_INTERNAL")
			return
		}
		if _, err := tx.Exec(r.Context(), `delete from public.pos_cart_lines where session_id=$1`, sessionID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to clear cart.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to hold order.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "pos.order.hold", "pos_held_order", &id, nil, body)
		response.OK(w, map[string]any{"id": id}, "Order held.")
	}
}

func listHeldOrders(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id, label, order_type, payload, created_at::text
			from public.pos_held_orders where tenant_id = $1 order by created_at desc limit 100`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load held orders.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []HeldOrder
		for rows.Next() {
			var h HeldOrder
			var payload []byte
			if err := rows.Scan(&h.ID, &h.Label, &h.OrderType, &payload, &h.CreatedAt); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read held orders.", "ERR_INTERNAL")
				return
			}
			_ = json.Unmarshal(payload, &h.Lines)
			h.LineCount = len(h.Lines)
			for _, ln := range h.Lines {
				h.Total = roundMoney(h.Total + ln.Qty*ln.UnitPrice)
			}
			out = append(out, h)
		}
		if out == nil {
			out = []HeldOrder{}
		}
		response.OK(w, out, "OK")
	}
}

func resumeHeldOrder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		heldID, err := parseID(chi.URLParam(r, "id"))
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		sess, err := loadOpenSessionForUser(r.Context(), pool, tu.TenantID, tu.AppUserID)
		if err != nil {
			response.Validation(w, map[string]string{"session": "Open a session before resuming a held order."})
			return
		}
		var payload []byte
		if err := pool.QueryRow(r.Context(), `select payload from public.pos_held_orders where id=$1 and tenant_id=$2`, heldID, tu.TenantID).Scan(&payload); err != nil {
			response.Err(w, http.StatusNotFound, "Held order not found.", "ERR_NOT_FOUND")
			return
		}
		var lines []HeldLine
		_ = json.Unmarshal(payload, &lines)
		if len(lines) == 0 {
			response.Validation(w, map[string]string{"held": "Held order is empty."})
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to resume order.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		var nextLineNo int
		_ = tx.QueryRow(r.Context(), `select coalesce(max(line_no),0) from public.pos_cart_lines where session_id=$1`, sess.ID).Scan(&nextLineNo)
		for _, ln := range lines {
			nextLineNo++
			lineTotal := roundMoney(ln.Qty * ln.UnitPrice)
			var lineID int64
			if err := tx.QueryRow(r.Context(), `
				insert into public.pos_cart_lines (session_id, line_no, item_id, item_code, item_name, qty, unit_price, line_total, notes, size_label)
				values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
				sess.ID, nextLineNo, ln.ItemID, ln.ItemCode, ln.ItemName, ln.Qty, ln.UnitPrice, lineTotal, ln.Notes, ln.SizeLabel).Scan(&lineID); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to restore lines.", "ERR_INTERNAL")
				return
			}
			for _, m := range ln.Modifiers {
				if _, err := tx.Exec(r.Context(), `
					insert into public.pos_cart_line_modifiers (line_id, modifier_id, name, price_delta)
					values ($1, nullif($2,0), $3, $4)`,
					lineID, m.ModifierID, m.Name, m.PriceDelta); err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to restore options.", "ERR_INTERNAL")
					return
				}
			}
		}
		if _, err := tx.Exec(r.Context(), `delete from public.pos_held_orders where id=$1 and tenant_id=$2`, heldID, tu.TenantID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to clear held order.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to resume order.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "pos.order.resume", "pos_held_order", &heldID, nil, nil)
		response.OK(w, map[string]any{"session_id": sess.ID}, "Order resumed.")
	}
}

func deleteHeldOrder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		heldID, err := parseID(chi.URLParam(r, "id"))
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `delete from public.pos_held_orders where id=$1 and tenant_id=$2`, heldID, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Held order not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, nil, "Deleted.")
	}
}

func addCashMovement(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		sessionID, err := parseID(chi.URLParam(r, "id"))
		if err != nil || !sessionOpen(r.Context(), pool, tu.TenantID, sessionID) {
			response.Validation(w, map[string]string{"session": "Open session required."})
			return
		}
		var body cashMovementBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		mt := strings.ToLower(strings.TrimSpace(body.MovementType))
		if mt != "in" && mt != "out" {
			response.Validation(w, map[string]string{"movement_type": "Type must be 'in' or 'out'."})
			return
		}
		if body.Amount <= 0 {
			response.Validation(w, map[string]string{"amount": "Amount must be greater than zero."})
			return
		}
		var id int64
		if err := pool.QueryRow(r.Context(), `
			insert into public.pos_cash_movements (session_id, movement_type, amount, reason, created_by_user_id)
			values ($1,$2,$3,$4,$5) returning id`,
			sessionID, mt, body.Amount, strings.TrimSpace(body.Reason), tu.AppUserID).Scan(&id); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to record cash movement.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "pos.cash_movement", "pos_cash_movement", &id, nil, body)
		response.OK(w, map[string]any{"id": id}, "Recorded.")
	}
}

func sessionReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		sessionID, err := parseID(chi.URLParam(r, "id"))
		if err != nil || !sessionBelongsToTenant(r.Context(), pool, tu.TenantID, sessionID) {
			response.Err(w, http.StatusNotFound, "Session not found.", "ERR_NOT_FOUND")
			return
		}
		rep := SessionReport{TendersByType: map[string]float64{}}
		_ = pool.QueryRow(r.Context(), `select session_no, status, opening_cash::float8, sales_total::float8 from public.pos_sessions where id=$1 and tenant_id=$2`, sessionID, tu.TenantID).
			Scan(&rep.SessionNo, &rep.Status, &rep.OpeningCash, &rep.SalesTotal)

		trows, err := pool.Query(r.Context(), `select tender_type, sum(amount)::float8 from public.pos_tenders where session_id=$1 group by tender_type`, sessionID)
		if err == nil {
			for trows.Next() {
				var t string
				var amt float64
				if err := trows.Scan(&t, &amt); err == nil {
					rep.TendersByType[t] = roundMoney(amt)
				}
			}
			trows.Close()
		}

		crows, err := pool.Query(r.Context(), `select movement_type, sum(amount)::float8 from public.pos_cash_movements where session_id=$1 group by movement_type`, sessionID)
		if err == nil {
			for crows.Next() {
				var mt string
				var amt float64
				if err := crows.Scan(&mt, &amt); err == nil {
					if mt == "in" {
						rep.CashIn = roundMoney(amt)
					} else {
						rep.CashOut = roundMoney(amt)
					}
				}
			}
			crows.Close()
		}
		rep.ExpectedCash = roundMoney(rep.OpeningCash + rep.TendersByType["cash"] + rep.CashIn - rep.CashOut)
		response.OK(w, rep, "OK")
	}
}

type PosLog struct {
	ID         int64   `json:"id"`
	ActionCode string  `json:"action_code"`
	TargetType string  `json:"target_type"`
	TargetID   *int64  `json:"target_id,omitempty"`
	ActorName  string  `json:"actor_name,omitempty"`
	CreatedAt  string  `json:"created_at"`
}

func listPosLogs(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select a.id, a.action_code, a.target_type, a.target_id, coalesce(u.full_name, ''), a.created_at::text
			from public.audit_logs a
			left join public.users u on u.id = a.actor_user_id
			where a.tenant_id = $1 and a.action_code like 'pos.%'
			order by a.created_at desc limit 200`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load logs.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []PosLog
		for rows.Next() {
			var l PosLog
			if err := rows.Scan(&l.ID, &l.ActionCode, &l.TargetType, &l.TargetID, &l.ActorName, &l.CreatedAt); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read logs.", "ERR_INTERNAL")
				return
			}
			out = append(out, l)
		}
		if out == nil {
			out = []PosLog{}
		}
		response.OK(w, out, "OK")
	}
}
