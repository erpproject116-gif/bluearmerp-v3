package pos

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/inventory"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/sales"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type Session struct {
	ID            int64      `json:"id"`
	SessionNo     string     `json:"session_no"`
	LocationID    int64      `json:"location_id"`
	LocationName  string     `json:"location_name,omitempty"`
	CashierUserID int64      `json:"cashier_user_id"`
	CashierName   string     `json:"cashier_name,omitempty"`
	Status        string     `json:"status"`
	OpeningCash   float64    `json:"opening_cash"`
	ClosingCash   *float64   `json:"closing_cash,omitempty"`
	SalesTotal    float64    `json:"sales_total"`
	OpenedAt      string     `json:"opened_at"`
	ClosedAt      *string    `json:"closed_at,omitempty"`
	Notes         *string    `json:"notes,omitempty"`
	CartLines     []CartLine `json:"cart_lines,omitempty"`
}

type CartLine struct {
	ID        int64             `json:"id"`
	LineNo    int               `json:"line_no"`
	ItemID    int64             `json:"item_id"`
	ItemCode  string            `json:"item_code"`
	ItemName  string            `json:"item_name"`
	Qty       float64           `json:"qty"`
	UnitPrice float64           `json:"unit_price"`
	LineTotal float64           `json:"line_total"`
	Notes     *string           `json:"notes,omitempty"`
	SizeLabel *string           `json:"size_label,omitempty"`
	SerialUnitIDs []int64            `json:"serial_unit_ids,omitempty"`
	LotBatchID    *int64             `json:"lot_batch_id,omitempty"`
	LotNo         string             `json:"lot_no,omitempty"`
	Modifiers     []CartLineModifier `json:"modifiers,omitempty"`
}

type CartLineModifier struct {
	ID         int64   `json:"id"`
	ModifierID int64   `json:"modifier_id,omitempty"`
	Name       string  `json:"name"`
	PriceDelta float64 `json:"price_delta"`
}

type Tender struct {
	ID         int64   `json:"id"`
	SessionID  int64   `json:"session_id"`
	SalesID    int64   `json:"sales_id"`
	SalesNo    string  `json:"sales_no,omitempty"`
	TenderType string  `json:"tender_type"`
	Amount     float64 `json:"amount"`
}

type openSessionBody struct {
	LocationID  int64   `json:"location_id"`
	OpeningCash float64 `json:"opening_cash"`
	Notes       *string `json:"notes"`
}

type closeSessionBody struct {
	ClosingCash float64 `json:"closing_cash"`
	Notes       *string `json:"notes"`
}

type cartLineBody struct {
	ItemID      int64   `json:"item_id"`
	Qty         float64 `json:"qty"`
	UnitPrice   float64 `json:"unit_price"`
	ModifierIDs []int64 `json:"modifier_ids"`
	Notes       *string `json:"notes"`
	SizeLabel   *string `json:"size_label"`
}

type cartLinePatch struct {
	Qty           *float64 `json:"qty"`
	UnitPrice     *float64 `json:"unit_price"`
	SerialUnitIDs []int64  `json:"serial_unit_ids"`
	LotBatchID    *int64   `json:"lot_batch_id"`
}

type checkoutBody struct {
	PartnerID       *int64         `json:"partner_id"`
	Tenders         []tenderBody   `json:"tenders"`
	DiscountAmount  float64        `json:"discount_amount"`
	VoucherCode     string         `json:"voucher_code"`
	VoucherAmount   float64        `json:"voucher_amount"`
	PrivilegeType   string         `json:"privilege_type"`
	PrivilegeIDNo   string         `json:"privilege_id_no"`
	PrivilegeName   string         `json:"privilege_name"`
	TipAmount       float64        `json:"tip_amount"`
	TableLabel      string         `json:"table_label"`
	OrderType       string         `json:"order_type"`
}

type tenderBody struct {
	TenderType string  `json:"tender_type"`
	Amount     float64 `json:"amount"`
}

type checkoutResult struct {
	SalesID           int64    `json:"sales_id"`
	SalesNo           string   `json:"sales_no"`
	GrandTotal        float64  `json:"grand_total"`
	Change            float64  `json:"change"`
	Tenders           []Tender `json:"tenders"`
	JournalEntryID    *int64   `json:"journal_entry_id,omitempty"`
	OfficialReceiptID *int64   `json:"official_receipt_id,omitempty"`
}

type cartLineQuerier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

func registerSessionRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/sessions", listSessions(pool))
	r.Get("/sessions/current", getCurrentSession(pool))
	r.With(auth.RequirePermission("pos.sessions", auth.AccessWrite)).Post("/sessions", openSession(pool))
	r.Get("/sessions/{id}", getSession(pool))
	r.With(auth.RequirePermission("pos.sessions", auth.AccessWrite)).Post("/sessions/{id}/close", closeSession(pool))
	r.Get("/sessions/{id}/cart-lines", listCartLines(pool))
	r.With(auth.RequirePermission("pos.checkout", auth.AccessWrite)).Post("/sessions/{id}/cart-lines", addCartLine(pool))
	r.With(auth.RequirePermission("pos.checkout", auth.AccessWrite)).Patch("/sessions/{id}/cart-lines/{lineId}", patchCartLine(pool))
	r.With(auth.RequirePermission("pos.checkout", auth.AccessWrite)).Delete("/sessions/{id}/cart-lines/{lineId}", deleteCartLine(pool))
	r.With(auth.RequirePermission("pos.checkout", auth.AccessWrite)).Post("/sessions/{id}/checkout", checkoutSession(pool))
}

func listSessions(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{"session_no": "s.session_no", "status": "s.status", "opened_at": "s.opened_at"}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "opened_at", allowed)
		if p.Order == "" {
			p.Order = "desc"
		}
		offset := httputil.Offset(p)
		where := "s.tenant_id = $1"
		args := []any{tu.TenantID}
		n := 2
		if st := strings.TrimSpace(r.URL.Query().Get("status")); st != "" {
			where += fmt.Sprintf(" and s.status = $%d", n)
			args = append(args, st)
			n++
		}
		sortCol := allowed[p.Sort]
		if sortCol == "" {
			sortCol = "s.opened_at"
		}
		q := fmt.Sprintf(`
			select s.id, s.session_no, s.location_id, coalesce(l.location_name, ''),
			  s.cashier_user_id, coalesce(u.full_name, ''),
			  s.status, s.opening_cash::float8, s.closing_cash::float8, s.sales_total::float8,
			  s.opened_at::text, s.closed_at::text, s.notes, count(*) over()
			from public.pos_sessions s
			left join public.inv_locations l on l.id = s.location_id
			left join public.users u on u.id = s.cashier_user_id
			where %s order by %s %s limit $%d offset $%d`,
			where, sortCol, orderSQL(p.Order), n, n+1)
		args = append(args, p.PageSize, offset)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list sessions.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []Session
		var total int64
		for rows.Next() {
			var row Session
			var closing *float64
			var closed *string
			var notes *string
			if err := rows.Scan(
				&row.ID, &row.SessionNo, &row.LocationID, &row.LocationName,
				&row.CashierUserID, &row.CashierName, &row.Status,
				&row.OpeningCash, &closing, &row.SalesTotal,
				&row.OpenedAt, &closed, &notes, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read session.", "ERR_INTERNAL")
				return
			}
			row.ClosingCash = closing
			row.ClosedAt = closed
			row.Notes = notes
			out = append(out, row)
		}
		if out == nil {
			out = []Session{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func getCurrentSession(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		row, err := loadOpenSessionForUser(r.Context(), pool, tu.TenantID, tu.AppUserID)
		if err != nil {
			response.OK(w, nil, "No open session.")
			return
		}
		lines, _ := loadCartLines(r.Context(), pool, row.ID)
		row.CartLines = lines
		response.OK(w, row, "OK")
	}
}

func openSession(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body openSessionBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if body.LocationID <= 0 {
			response.Validation(w, map[string]string{"location_id": "Location is required."})
			return
		}
		var hasOpen bool
		_ = pool.QueryRow(r.Context(), `
			select exists(select 1 from public.pos_sessions where tenant_id = $1 and cashier_user_id = $2 and status = 'open')`,
			tu.TenantID, tu.AppUserID).Scan(&hasOpen)
		if hasOpen {
			response.Validation(w, map[string]string{"session": "You already have an open POS session."})
			return
		}
		openedAt := time.Now()
		var seq int
		_ = pool.QueryRow(r.Context(), `
			select coalesce(max(substring(session_no from '[0-9]+$')::int), 0) + 1
			from public.pos_sessions where tenant_id = $1 and opened_at::date = $2::date`,
			tu.TenantID, openedAt.Format("2006-01-02")).Scan(&seq)
		sessionNo := fmt.Sprintf("POS-%s-%03d", openedAt.Format("20060102"), seq)
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.pos_sessions (tenant_id, session_no, location_id, cashier_user_id, opening_cash, notes)
			values ($1,$2,$3,$4,$5,$6) returning id`,
			tu.TenantID, sessionNo, body.LocationID, tu.AppUserID, body.OpeningCash, body.Notes).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to open session.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "pos.session.open", "pos_session", &id, nil, body)
		row, _ := loadSession(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "Session opened.")
	}
}

func getSession(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := parseID(chi.URLParam(r, "id"))
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		row, err := loadSession(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Session not found.", "ERR_NOT_FOUND")
			return
		}
		lines, _ := loadCartLines(r.Context(), pool, id)
		row.CartLines = lines
		response.OK(w, row, "OK")
	}
}

func closeSession(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := parseID(chi.URLParam(r, "id"))
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body closeSessionBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		var cartCount int
		_ = pool.QueryRow(r.Context(), `select count(*) from public.pos_cart_lines where session_id = $1`, id).Scan(&cartCount)
		if cartCount > 0 {
			response.Validation(w, map[string]string{"cart": "Cart must be empty before closing session."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.pos_sessions set status = 'closed', closing_cash = $3,
			  notes = coalesce($4, notes), closed_at = now(), updated_at = now()
			where id = $1 and tenant_id = $2 and status = 'open'`,
			id, tu.TenantID, body.ClosingCash, body.Notes)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Open session not found.", "ERR_NOT_FOUND")
			return
		}
		row, _ := loadSession(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "Session closed.")
	}
}

func listCartLines(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		sessionID, err := parseID(chi.URLParam(r, "id"))
		if err != nil || !sessionBelongsToTenant(r.Context(), pool, tu.TenantID, sessionID) {
			response.Err(w, http.StatusNotFound, "Session not found.", "ERR_NOT_FOUND")
			return
		}
		lines, err := loadCartLines(r.Context(), pool, sessionID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load cart.", "ERR_INTERNAL")
			return
		}
		response.OK(w, lines, "OK")
	}
}

func addCartLine(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		sessionID, err := parseID(chi.URLParam(r, "id"))
		if err != nil || !sessionOpen(r.Context(), pool, tu.TenantID, sessionID) {
			response.Validation(w, map[string]string{"session": "Open session required."})
			return
		}
		var body cartLineBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if body.ItemID <= 0 || body.Qty <= 0 {
			response.Validation(w, map[string]string{"lines": "Item and quantity are required."})
			return
		}
		var itemCode, itemName string
		if err := pool.QueryRow(r.Context(), `
			select item_code, item_name from public.inv_items where id = $1 and tenant_id = $2 and deleted_at is null`,
			body.ItemID, tu.TenantID).Scan(&itemCode, &itemName); err != nil {
			response.Validation(w, map[string]string{"item_id": "Item not found."})
			return
		}
		// Resolve any selected modifiers server-side (never trust client prices).
		var mods []CartLineModifier
		var modsDelta float64
		if len(body.ModifierIDs) > 0 {
			rows, err := pool.Query(r.Context(), `
				select m.id, m.name, m.price_delta::float8
				from public.pos_modifiers m
				join public.pos_modifier_groups g on g.id = m.group_id
				where m.id = any($1) and g.tenant_id = $2 and m.active = true`,
				body.ModifierIDs, tu.TenantID)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load modifiers.", "ERR_INTERNAL")
				return
			}
			for rows.Next() {
				var m CartLineModifier
				if err := rows.Scan(&m.ModifierID, &m.Name, &m.PriceDelta); err != nil {
					rows.Close()
					response.Err(w, http.StatusInternalServerError, "Failed to read modifiers.", "ERR_INTERNAL")
					return
				}
				modsDelta += m.PriceDelta
				mods = append(mods, m)
			}
			rows.Close()
		}
		effUnit := roundMoney(body.UnitPrice + modsDelta)
		lineTotal := roundMoney(body.Qty * effUnit)
		var lineNo int
		_ = pool.QueryRow(r.Context(), `select coalesce(max(line_no), 0) + 1 from public.pos_cart_lines where session_id = $1`, sessionID).Scan(&lineNo)
		var lineID int64
		if err := pool.QueryRow(r.Context(), `
			insert into public.pos_cart_lines (session_id, line_no, item_id, item_code, item_name, qty, unit_price, line_total, notes, size_label)
			values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
			sessionID, lineNo, body.ItemID, itemCode, itemName, body.Qty, effUnit, lineTotal, body.Notes, body.SizeLabel).Scan(&lineID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to add line.", "ERR_INTERNAL")
			return
		}
		for i := range mods {
			var mid int64
			if err := pool.QueryRow(r.Context(), `
				insert into public.pos_cart_line_modifiers (line_id, modifier_id, name, price_delta)
				values ($1,$2,$3,$4) returning id`,
				lineID, mods[i].ModifierID, mods[i].Name, mods[i].PriceDelta).Scan(&mid); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to save modifiers.", "ERR_INTERNAL")
				return
			}
			mods[i].ID = mid
		}
		response.OK(w, CartLine{ID: lineID, LineNo: lineNo, ItemID: body.ItemID, ItemCode: itemCode, ItemName: itemName, Qty: body.Qty, UnitPrice: effUnit, LineTotal: lineTotal, Notes: body.Notes, SizeLabel: body.SizeLabel, Modifiers: mods}, "Added.")
	}
}

func patchCartLine(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		sessionID, _ := parseID(chi.URLParam(r, "id"))
		lineID, _ := parseID(chi.URLParam(r, "lineId"))
		if !sessionOpen(r.Context(), pool, tu.TenantID, sessionID) {
			response.Validation(w, map[string]string{"session": "Open session required."})
			return
		}
		var body cartLinePatch
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		var qty, unitPrice float64
		if err := pool.QueryRow(r.Context(), `select qty::float8, unit_price::float8 from public.pos_cart_lines where id = $1 and session_id = $2`, lineID, sessionID).Scan(&qty, &unitPrice); err != nil {
			response.Err(w, http.StatusNotFound, "Cart line not found.", "ERR_NOT_FOUND")
			return
		}
		if body.Qty != nil {
			qty = *body.Qty
		}
		if body.UnitPrice != nil {
			unitPrice = *body.UnitPrice
		}
		lineTotal := roundMoney(qty * unitPrice)
		if body.SerialUnitIDs != nil || body.LotBatchID != nil {
			serialIDs := body.SerialUnitIDs
			if serialIDs == nil {
				_ = pool.QueryRow(r.Context(), `select coalesce(serial_unit_ids, '{}') from public.pos_cart_lines where id = $1 and session_id = $2`, lineID, sessionID).Scan(&serialIDs)
			}
			lotBatchID := body.LotBatchID
			if lotBatchID == nil {
				_ = pool.QueryRow(r.Context(), `select lot_batch_id from public.pos_cart_lines where id = $1 and session_id = $2`, lineID, sessionID).Scan(&lotBatchID)
			}
			_, err := pool.Exec(r.Context(), `update public.pos_cart_lines set qty=$3, unit_price=$4, line_total=$5, serial_unit_ids=$6, lot_batch_id=$7, updated_at=now() where id=$1 and session_id=$2`, lineID, sessionID, qty, unitPrice, lineTotal, serialIDs, lotBatchID)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to update cart line.", "ERR_INTERNAL")
				return
			}
			response.OK(w, CartLine{ID: lineID, Qty: qty, UnitPrice: unitPrice, LineTotal: lineTotal, SerialUnitIDs: serialIDs, LotBatchID: lotBatchID}, "Updated.")
			return
		}
		tag, err := pool.Exec(r.Context(), `update public.pos_cart_lines set qty=$3, unit_price=$4, line_total=$5, updated_at=now() where id=$1 and session_id=$2`, lineID, sessionID, qty, unitPrice, lineTotal)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Cart line not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, CartLine{ID: lineID, Qty: qty, UnitPrice: unitPrice, LineTotal: lineTotal}, "Updated.")
	}
}

func deleteCartLine(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		sessionID, _ := parseID(chi.URLParam(r, "id"))
		lineID, _ := parseID(chi.URLParam(r, "lineId"))
		if !sessionOpen(r.Context(), pool, tu.TenantID, sessionID) {
			response.Validation(w, map[string]string{"session": "Open session required."})
			return
		}
		tag, err := pool.Exec(r.Context(), `delete from public.pos_cart_lines where id=$1 and session_id=$2`, lineID, sessionID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Cart line not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, nil, "Deleted.")
	}
}

func checkoutSession(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		sessionID, err := parseID(chi.URLParam(r, "id"))
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body checkoutBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if len(body.Tenders) == 0 {
			response.Validation(w, map[string]string{"tenders": "At least one tender is required."})
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to checkout.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var locationID int64
		var status string
		if err := tx.QueryRow(r.Context(), `select location_id, status from public.pos_sessions where id=$1 and tenant_id=$2 for update`, sessionID, tu.TenantID).Scan(&locationID, &status); err != nil {
			response.Err(w, http.StatusNotFound, "Session not found.", "ERR_NOT_FOUND")
			return
		}
		if status != "open" {
			response.Validation(w, map[string]string{"session": "Session is not open."})
			return
		}
		lines, err := loadCartLinesTx(r.Context(), tx, sessionID)
		if err != nil || len(lines) == 0 {
			response.Validation(w, map[string]string{"cart": "Cart is empty."})
			return
		}
		var subtotalLines float64
		for _, ln := range lines {
			subtotalLines += ln.LineTotal
		}
		subtotalLines = roundMoney(subtotalLines)

		privCfg := privilegeSettings{SeniorPct: 20, PwdPct: 20, StudentPct: 10}
		_ = tx.QueryRow(r.Context(), `
			select coalesce(privilege_senior_pct, 20)::float8,
			       coalesce(privilege_pwd_pct, 20)::float8,
			       coalesce(student_discount_pct, 10)::float8
			from public.pos_settings where tenant_id = $1`, tu.TenantID).Scan(&privCfg.SeniorPct, &privCfg.PwdPct, &privCfg.StudentPct)

		privType := normalizePrivilegeType(body.PrivilegeType)
		if privType == PrivilegeNone && body.DiscountAmount > 0 {
			privType = PrivilegeManual
		}
		priv, err := applyPrivilegeDiscount(subtotalLines, privilegeInput{
			Type:           privType,
			IDNo:           body.PrivilegeIDNo,
			Name:           body.PrivilegeName,
			ManualDiscount: body.DiscountAmount,
			VoucherAmount:  body.VoucherAmount,
		}, privCfg)
		if err != nil {
			response.Validation(w, map[string]string{"privilege": err.Error()})
			return
		}
		discountTotal := priv.Discount
		subtotalLines = priv.BaseAfterDisc

		lotInputs := make([]sales.SaleLotLineInput, len(lines))
		for i, ln := range lines {
			itemID := ln.ItemID
			lotInputs[i] = sales.SaleLotLineInput{
				LineNo:     i + 1,
				ItemID:     &itemID,
				Qty:        ln.Qty,
				LotBatchID: ln.LotBatchID,
			}
		}
		if err := sales.ValidateSaleLotForCheckout(r.Context(), tx, tu.TenantID, lotInputs); err != nil {
			response.Validation(w, map[string]string{"cart": err.Error()})
			return
		}

		// Resolve tax from POS settings (default tax type + inclusive flag).
		var settingsTaxTypeID *int64
		var settingsTaxInclusive bool = true
		_ = tx.QueryRow(r.Context(), `select default_tax_type_id, tax_inclusive from public.pos_settings where tenant_id=$1`, tu.TenantID).Scan(&settingsTaxTypeID, &settingsTaxInclusive)
		var resolvedTaxTypeID int64
		if settingsTaxTypeID != nil {
			resolvedTaxTypeID = *settingsTaxTypeID
		}
		taxMode := "none"
		var ratePercent float64
		if resolvedTaxTypeID > 0 {
			_ = tx.QueryRow(r.Context(), `select tax_mode, rate_percent::float8 from public.quo_tax_types where id=$1 and tenant_id=$2`, resolvedTaxTypeID, tu.TenantID).Scan(&taxMode, &ratePercent)
		}
		// When the tenant configured tax-exclusive pricing, treat an "included" tax type as excluded.
		if taxMode == "included" && !settingsTaxInclusive {
			taxMode = "excluded"
		}
		// Strict PH privilege: senior/PWD sales are VAT-exempt on the discounted ticket.
		if priv.VATExempted {
			taxMode = "none"
		}

		var subtotal, taxTotal, grandTotal float64
		templateCode := "non_vat"
		switch taxMode {
		case "included":
			taxTotal = roundMoney(subtotalLines * ratePercent / (100 + ratePercent))
			subtotal = roundMoney(subtotalLines - taxTotal)
			grandTotal = subtotalLines
			templateCode = "vat_included"
		case "excluded":
			taxTotal = roundMoney(subtotalLines * ratePercent / 100)
			subtotal = subtotalLines
			grandTotal = roundMoney(subtotalLines + taxTotal)
			templateCode = "default"
		default:
			taxTotal = 0
			subtotal = subtotalLines
			grandTotal = subtotalLines
			if priv.VATExempted {
				templateCode = "non_vat"
			}
		}

		tipAmount := roundMoney(body.TipAmount)
		if tipAmount < 0 {
			tipAmount = 0
		}
		amountDue := roundMoney(grandTotal + tipAmount)

		var tenderTotal float64
		for _, t := range body.Tenders {
			tenderTotal += t.Amount
		}
		tenderTotal = roundMoney(tenderTotal)
		if tenderTotal+0.01 < amountDue {
			response.Validation(w, map[string]string{"tenders": "Tender total is less than the amount due (including tip)."})
			return
		}
		change := roundMoney(tenderTotal - amountDue)
		// Record the primary payment mode on the sale so receipts/reports reflect it.
		primaryTender := normalizeTenderType(body.Tenders[0].TenderType)
		partnerID := int64(0)
		if body.PartnerID != nil {
			partnerID = *body.PartnerID
		}
		if partnerID <= 0 {
			_ = tx.QueryRow(r.Context(), `select id from public.inv_partners where tenant_id=$1 and partner_kind in ('customer','both') and deleted_at is null order by id limit 1`, tu.TenantID).Scan(&partnerID)
		}
		if partnerID <= 0 {
			response.Validation(w, map[string]string{"partner_id": "No walk-in customer configured."})
			return
		}
		var taxTypeID, currencyID int64
		if resolvedTaxTypeID > 0 {
			taxTypeID = resolvedTaxTypeID
		} else if err := tx.QueryRow(r.Context(), `select id from public.quo_tax_types where tenant_id=$1 and status='active' order by sort_order, id limit 1`, tu.TenantID).Scan(&taxTypeID); err != nil {
			response.Validation(w, map[string]string{"tax_type_id": "No active tax type."})
			return
		}
		if err := tx.QueryRow(r.Context(), `select id from public.quo_currencies where tenant_id=$1 and status='active' order by is_default desc, id limit 1`, tu.TenantID).Scan(&currencyID); err != nil {
			response.Validation(w, map[string]string{"currency_id": "No active currency."})
			return
		}
		orderDate := time.Now()
		var dateSeq int
		var salesNo string
		if err := tx.QueryRow(r.Context(), `select date_seq, sales_no from public.allocate_sales_sequences($1,$2::date)`, tu.TenantID, orderDate).Scan(&dateSeq, &salesNo); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to allocate sales number.", "ERR_INTERNAL")
			return
		}
		var salesID int64
		notesParts := []string{}
		if priv.Type == PrivilegeSenior || priv.Type == PrivilegePWD || priv.Type == PrivilegeStudent {
			notesParts = append(notesParts, fmt.Sprintf("Privilege: %s", priv.Type))
			if priv.IDNo != "" {
				notesParts = append(notesParts, "ID: "+priv.IDNo)
			}
			if priv.Name != "" {
				notesParts = append(notesParts, "Name: "+priv.Name)
			}
			if priv.VATExempted {
				notesParts = append(notesParts, "VAT exempt (senior/PWD)")
			}
		}
		if tipAmount > 0 {
			notesParts = append(notesParts, fmt.Sprintf("Tip: %.2f", tipAmount))
		}
		if strings.TrimSpace(body.TableLabel) != "" {
			notesParts = append(notesParts, "Table: "+strings.TrimSpace(body.TableLabel))
		}
		saleNotes := strings.Join(notesParts, " · ")
		if err := tx.QueryRow(r.Context(), `
			insert into public.sa_sales (tenant_id, order_date, date_seq, sales_no, tax_type_id, currency_id, partner_id,
			  pic_user_id, pic_name, location_id, terms_of_payment, progress_status, template_code, notes,
			  subtotal, tax_total, grand_total, created_by_user_id, invoicing_status)
			values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'completed',$12,$13,$14,$15,$16,$17,true) returning id`,
			tu.TenantID, orderDate, dateSeq, salesNo, taxTypeID, currencyID, partnerID,
			tu.AppUserID, tu.FullName, locationID, primaryTender, templateCode, saleNotes,
			subtotal, taxTotal, grandTotal, tu.AppUserID).Scan(&salesID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create sale.", "ERR_INTERNAL")
			return
		}
		if _, err := tx.Exec(r.Context(), `
			insert into public.pos_sale_attrs (
			  sales_id, tenant_id, privilege_type, privilege_id_no, privilege_name, privilege_pct,
			  discount_amount, tip_amount, table_label, order_type, vat_exempted
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
			salesID, tu.TenantID, string(priv.Type), priv.IDNo, priv.Name, priv.Pct,
			discountTotal, tipAmount, strings.TrimSpace(body.TableLabel), strings.TrimSpace(body.OrderType), priv.VATExempted,
		); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save POS sale attributes.", "ERR_INTERNAL")
			return
		}
		for i, ln := range lines {
			var saleLineID int64
			if err := tx.QueryRow(r.Context(), `
				insert into public.sa_sales_lines (sales_id, line_no, item_id, item_code, item_name, qty, unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total, lot_batch_id)
				values ($1,$2,$3,$4,$5,$6,$7,$8,0,$7,$8,$9) returning id`,
				salesID, i+1, ln.ItemID, ln.ItemCode, ln.ItemName, ln.Qty, ln.UnitPrice, ln.LineTotal, ln.LotBatchID).Scan(&saleLineID); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to save sale lines.", "ERR_INTERNAL")
				return
			}
			var trackInventory bool
			_ = tx.QueryRow(r.Context(), `select track_inventory_qty from public.inv_items where id=$1`, ln.ItemID).Scan(&trackInventory)
			if trackInventory {
				if err := inventory.ApplyStockDelta(r.Context(), tx, tu.TenantID, ln.ItemID, locationID, -ln.Qty, tu.AppUserID, "pos_checkout", salesID, "sales"); err != nil {
					response.Validation(w, map[string]string{"stock": err.Error()})
					return
				}
			}
		}
		serialInputs := make([]sales.SaleSerialLineInput, len(lines))
		for i, ln := range lines {
			itemID := ln.ItemID
			serialInputs[i] = sales.SaleSerialLineInput{
				LineNo: i + 1, ItemID: &itemID, Qty: ln.Qty, SerialUnitIDs: ln.SerialUnitIDs,
			}
		}
		if err := sales.ApplySaleSerialUnitsForCheckout(r.Context(), tx, tu.TenantID, salesID, partnerID, serialInputs); err != nil {
			response.Validation(w, map[string]string{"serials": err.Error()})
			return
		}
		if err := sales.ApplySaleLot(r.Context(), tx, tu.TenantID, salesID); err != nil {
			response.Validation(w, map[string]string{"lots": err.Error()})
			return
		}
		acct, err := postCheckoutAccounting(r.Context(), tx, tu.TenantID, tu.AppUserID, salesID, partnerID, currencyID, orderDate, salesNo, subtotal, taxTotal, grandTotal, primaryTender)
		if err != nil {
			response.Validation(w, map[string]string{"accounting": err.Error()})
			return
		}
		var outTenders []Tender
		for _, t := range body.Tenders {
			tt := normalizeTenderType(t.TenderType)
			var tenderID int64
			if err := tx.QueryRow(r.Context(), `insert into public.pos_tenders (session_id, sales_id, tender_type, amount) values ($1,$2,$3,$4) returning id`, sessionID, salesID, tt, t.Amount).Scan(&tenderID); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to record tender.", "ERR_INTERNAL")
				return
			}
			outTenders = append(outTenders, Tender{ID: tenderID, SessionID: sessionID, SalesID: salesID, SalesNo: salesNo, TenderType: tt, Amount: t.Amount})
		}
		if _, err := tx.Exec(r.Context(), `delete from public.pos_cart_lines where session_id=$1`, sessionID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to clear cart.", "ERR_INTERNAL")
			return
		}
		if _, err := tx.Exec(r.Context(), `update public.pos_sessions set sales_total=sales_total+$3, updated_at=now() where id=$1 and tenant_id=$2`, sessionID, tu.TenantID, amountDue); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update session.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save checkout.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "pos.checkout", "sa_sales", &salesID, nil, body)
		response.OK(w, checkoutResult{
			SalesID: salesID, SalesNo: salesNo, GrandTotal: amountDue, Change: change, Tenders: outTenders,
			JournalEntryID: acct.JournalEntryID, OfficialReceiptID: acct.OfficialReceiptID,
		}, "Checkout complete.")
	}
}

func loadSession(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (Session, error) {
	var row Session
	var closing *float64
	var closed *string
	var notes *string
	err := pool.QueryRow(ctx, `
		select s.id, s.session_no, s.location_id, coalesce(l.location_name,''), s.cashier_user_id, coalesce(u.full_name,''),
		  s.status, s.opening_cash::float8, s.closing_cash::float8, s.sales_total::float8, s.opened_at::text, s.closed_at::text, s.notes
		from public.pos_sessions s
		left join public.inv_locations l on l.id=s.location_id
		left join public.users u on u.id=s.cashier_user_id
		where s.id=$1 and s.tenant_id=$2`, id, tenantID).Scan(
		&row.ID, &row.SessionNo, &row.LocationID, &row.LocationName, &row.CashierUserID, &row.CashierName,
		&row.Status, &row.OpeningCash, &closing, &row.SalesTotal, &row.OpenedAt, &closed, &notes)
	row.ClosingCash = closing
	row.ClosedAt = closed
	row.Notes = notes
	return row, err
}

func loadOpenSessionForUser(ctx context.Context, pool *pgxpool.Pool, tenantID, userID int64) (Session, error) {
	var id int64
	if err := pool.QueryRow(ctx, `select id from public.pos_sessions where tenant_id=$1 and cashier_user_id=$2 and status='open' order by opened_at desc limit 1`, tenantID, userID).Scan(&id); err != nil {
		return Session{}, err
	}
	return loadSession(ctx, pool, tenantID, id)
}

func loadCartLines(ctx context.Context, pool *pgxpool.Pool, sessionID int64) ([]CartLine, error) {
	return loadCartLinesQuery(ctx, pool, sessionID)
}

func loadCartLinesTx(ctx context.Context, tx pgx.Tx, sessionID int64) ([]CartLine, error) {
	return loadCartLinesQuery(ctx, tx, sessionID)
}

func loadCartLinesQuery(ctx context.Context, q cartLineQuerier, sessionID int64) ([]CartLine, error) {
	rows, err := q.Query(ctx, `
		select cl.id, cl.line_no, cl.item_id, cl.item_code, cl.item_name, cl.qty::float8, cl.unit_price::float8, cl.line_total::float8,
		  cl.notes, cl.size_label, coalesce(cl.serial_unit_ids, '{}'), cl.lot_batch_id, coalesce(lb.lot_no, '')
		from public.pos_cart_lines cl
		left join public.inv_lot_batches lb on lb.id = cl.lot_batch_id
		where cl.session_id=$1 order by cl.line_no`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []CartLine
	byID := map[int64]int{}
	var lineIDs []int64
	for rows.Next() {
		var ln CartLine
		if err := rows.Scan(&ln.ID, &ln.LineNo, &ln.ItemID, &ln.ItemCode, &ln.ItemName, &ln.Qty, &ln.UnitPrice, &ln.LineTotal, &ln.Notes, &ln.SizeLabel, &ln.SerialUnitIDs, &ln.LotBatchID, &ln.LotNo); err != nil {
			return nil, err
		}
		byID[ln.ID] = len(out)
		lineIDs = append(lineIDs, ln.ID)
		out = append(out, ln)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(lineIDs) > 0 {
		mrows, err := q.Query(ctx, `select line_id, id, coalesce(modifier_id, 0), name, price_delta::float8 from public.pos_cart_line_modifiers where line_id = any($1) order by id`, lineIDs)
		if err != nil {
			return nil, err
		}
		defer mrows.Close()
		for mrows.Next() {
			var lineID int64
			var m CartLineModifier
			if err := mrows.Scan(&lineID, &m.ID, &m.ModifierID, &m.Name, &m.PriceDelta); err != nil {
				return nil, err
			}
			if idx, ok := byID[lineID]; ok {
				out[idx].Modifiers = append(out[idx].Modifiers, m)
			}
		}
		if err := mrows.Err(); err != nil {
			return nil, err
		}
	}
	if out == nil {
		out = []CartLine{}
	}
	return out, nil
}

func sessionBelongsToTenant(ctx context.Context, pool *pgxpool.Pool, tenantID, sessionID int64) bool {
	var ok bool
	_ = pool.QueryRow(ctx, `select exists(select 1 from public.pos_sessions where id=$1 and tenant_id=$2)`, sessionID, tenantID).Scan(&ok)
	return ok
}

func sessionOpen(ctx context.Context, pool *pgxpool.Pool, tenantID, sessionID int64) bool {
	var ok bool
	_ = pool.QueryRow(ctx, `select exists(select 1 from public.pos_sessions where id=$1 and tenant_id=$2 and status='open')`, sessionID, tenantID).Scan(&ok)
	return ok
}

func parseID(s string) (int64, error) {
	id, err := strconv.ParseInt(strings.TrimSpace(s), 10, 64)
	if err != nil || id <= 0 {
		return 0, fmt.Errorf("invalid id")
	}
	return id, nil
}

func roundMoney(v float64) float64 {
	return math.Round(v*10000) / 10000
}

func normalizeTenderType(s string) string {
	switch strings.TrimSpace(strings.ToLower(s)) {
	case "cash", "gcash", "maya", "qrph", "card", "bank_transfer", "other":
		return strings.TrimSpace(strings.ToLower(s))
	case "":
		return "cash"
	default:
		// Unknown modes are recorded as "other" so they never inflate the cash drawer.
		return "other"
	}
}
