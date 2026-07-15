package pos

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type PosSettings struct {
	DefaultLocationID   *int64   `json:"default_location_id,omitempty"`
	DefaultLocationName string   `json:"default_location_name,omitempty"`
	DefaultTaxTypeID    *int64   `json:"default_tax_type_id,omitempty"`
	TaxInclusive        bool     `json:"tax_inclusive"`
	OrderTypes          []string `json:"order_types"`
	AllowedTenders      []string `json:"allowed_tenders"`
	RequireCustomer     bool     `json:"require_customer"`
	EnableBarcode       bool     `json:"enable_barcode"`
	ReceiptFooter       string   `json:"receipt_footer,omitempty"`
	AutoPostAccounting  bool     `json:"auto_post_accounting"`
	AutoCreateReceipt   bool     `json:"auto_create_receipt"`
	SalesAccountID      *int64   `json:"sales_account_id,omitempty"`
	ReceivableAccountID *int64   `json:"receivable_account_id,omitempty"`
	CashAccountID       *int64   `json:"cash_account_id,omitempty"`
	CardAccountID       *int64   `json:"card_account_id,omitempty"`
	// Read-only resolved fields for client-side tax preview.
	TaxMode        string  `json:"tax_mode,omitempty"`
	TaxRatePercent float64 `json:"tax_rate_percent"`
	StudentDiscountPct float64 `json:"student_discount_pct"`
	PrivilegeSeniorPct float64 `json:"privilege_senior_pct"`
	PrivilegePwdPct    float64 `json:"privilege_pwd_pct"`
	TipEnabled         bool    `json:"tip_enabled"`
}

type posSettingsBody struct {
	DefaultLocationID *int64   `json:"default_location_id"`
	DefaultTaxTypeID  *int64   `json:"default_tax_type_id"`
	TaxInclusive      *bool    `json:"tax_inclusive"`
	OrderTypes        []string `json:"order_types"`
	AllowedTenders    []string `json:"allowed_tenders"`
	RequireCustomer     *bool    `json:"require_customer"`
	EnableBarcode       *bool    `json:"enable_barcode"`
	ReceiptFooter       *string  `json:"receipt_footer"`
	AutoPostAccounting  *bool    `json:"auto_post_accounting"`
	AutoCreateReceipt   *bool    `json:"auto_create_receipt"`
	SalesAccountID      *int64   `json:"sales_account_id"`
	ReceivableAccountID *int64   `json:"receivable_account_id"`
	CashAccountID       *int64   `json:"cash_account_id"`
	CardAccountID       *int64   `json:"card_account_id"`
}

func registerSettingsRoutes(r chi.Router, pool *pgxpool.Pool) {
	// Register config is needed by the terminal (tax, tenders, default location), so allow
	// either terminal or manage to read it; only managers can change it.
	r.Get("/settings", getPosSettings(pool))
	r.With(auth.RequirePermission("pos.manage", auth.AccessWrite)).Put("/settings", putPosSettings(pool))
}

func loadPosSettings(pool *pgxpool.Pool, r *http.Request, tenantID int64) (PosSettings, error) {
	var s PosSettings
	var orderTypes, allowedTenders []byte
	var footer, taxMode *string
	var ratePercent *float64
	err := pool.QueryRow(r.Context(), `
		select ps.default_location_id, coalesce(loc.location_name, ''), ps.default_tax_type_id, ps.tax_inclusive, ps.order_types, ps.allowed_tenders,
		  ps.require_customer, ps.enable_barcode, ps.receipt_footer, tt.tax_mode, tt.rate_percent::float8,
		  coalesce(ps.auto_post_accounting, true), coalesce(ps.auto_create_receipt, true),
		  ps.sales_account_id, ps.receivable_account_id, ps.cash_account_id, ps.card_account_id,
		  coalesce(ps.student_discount_pct, 10)::float8,
		  coalesce(ps.privilege_senior_pct, 20)::float8,
		  coalesce(ps.privilege_pwd_pct, 20)::float8,
		  coalesce(ps.tip_enabled, true)
		from public.pos_settings ps
		left join public.quo_tax_types tt on tt.id = ps.default_tax_type_id and tt.tenant_id = ps.tenant_id
		left join public.inv_locations loc on loc.id = ps.default_location_id and loc.tenant_id = ps.tenant_id
		where ps.tenant_id = $1`, tenantID).
		Scan(&s.DefaultLocationID, &s.DefaultLocationName, &s.DefaultTaxTypeID, &s.TaxInclusive, &orderTypes, &allowedTenders,
			&s.RequireCustomer, &s.EnableBarcode, &footer, &taxMode, &ratePercent,
			&s.AutoPostAccounting, &s.AutoCreateReceipt,
			&s.SalesAccountID, &s.ReceivableAccountID, &s.CashAccountID, &s.CardAccountID,
			&s.StudentDiscountPct, &s.PrivilegeSeniorPct, &s.PrivilegePwdPct, &s.TipEnabled)
	if err != nil {
		return s, err
	}
	if taxMode != nil {
		s.TaxMode = *taxMode
	}
	if ratePercent != nil {
		s.TaxRatePercent = *ratePercent
	}
	_ = json.Unmarshal(orderTypes, &s.OrderTypes)
	_ = json.Unmarshal(allowedTenders, &s.AllowedTenders)
	if s.OrderTypes == nil {
		s.OrderTypes = []string{}
	}
	if s.AllowedTenders == nil {
		s.AllowedTenders = []string{}
	}
	if footer != nil {
		s.ReceiptFooter = *footer
	}
	return s, nil
}

func getPosSettings(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		if !tu.HasPermission("pos.terminal", auth.AccessRead) && !tu.HasPermission("pos.manage", auth.AccessRead) {
			response.Err(w, http.StatusForbidden, "You do not have permission for this action.", "ERR_FORBIDDEN")
			return
		}
		s, err := loadPosSettings(pool, r, tu.TenantID)
		if err != nil {
			// Lazily create a default row if none exists yet.
			_, _ = pool.Exec(r.Context(), `insert into public.pos_settings (tenant_id) values ($1) on conflict (tenant_id) do nothing`, tu.TenantID)
			s, err = loadPosSettings(pool, r, tu.TenantID)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load settings.", "ERR_INTERNAL")
				return
			}
		}
		response.OK(w, s, "OK")
	}
}

func putPosSettings(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body posSettingsBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		orderTypes := body.OrderTypes
		if orderTypes == nil {
			orderTypes = []string{}
		}
		allowedTenders := body.AllowedTenders
		if allowedTenders == nil {
			allowedTenders = []string{}
		}
		orderTypesJSON, _ := json.Marshal(orderTypes)
		allowedTendersJSON, _ := json.Marshal(allowedTenders)
		taxInclusive := true
		if body.TaxInclusive != nil {
			taxInclusive = *body.TaxInclusive
		}
		requireCustomer := false
		if body.RequireCustomer != nil {
			requireCustomer = *body.RequireCustomer
		}
		enableBarcode := false
		if body.EnableBarcode != nil {
			enableBarcode = *body.EnableBarcode
		}
		autoPostAccounting := true
		if body.AutoPostAccounting != nil {
			autoPostAccounting = *body.AutoPostAccounting
		}
		autoCreateReceipt := true
		if body.AutoCreateReceipt != nil {
			autoCreateReceipt = *body.AutoCreateReceipt
		}
		_, err := pool.Exec(r.Context(), `
			insert into public.pos_settings (tenant_id, default_location_id, default_tax_type_id, tax_inclusive,
			  order_types, allowed_tenders, require_customer, enable_barcode, receipt_footer,
			  auto_post_accounting, auto_create_receipt,
			  sales_account_id, receivable_account_id, cash_account_id, card_account_id, updated_at)
			values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, now())
			on conflict (tenant_id) do update set
			  default_location_id = excluded.default_location_id,
			  default_tax_type_id = excluded.default_tax_type_id,
			  tax_inclusive = excluded.tax_inclusive,
			  order_types = excluded.order_types,
			  allowed_tenders = excluded.allowed_tenders,
			  require_customer = excluded.require_customer,
			  enable_barcode = excluded.enable_barcode,
			  receipt_footer = excluded.receipt_footer,
			  auto_post_accounting = excluded.auto_post_accounting,
			  auto_create_receipt = excluded.auto_create_receipt,
			  sales_account_id = excluded.sales_account_id,
			  receivable_account_id = excluded.receivable_account_id,
			  cash_account_id = excluded.cash_account_id,
			  card_account_id = excluded.card_account_id,
			  updated_at = now()`,
			tu.TenantID, body.DefaultLocationID, body.DefaultTaxTypeID, taxInclusive,
			orderTypesJSON, allowedTendersJSON, requireCustomer, enableBarcode, body.ReceiptFooter,
			autoPostAccounting, autoCreateReceipt,
			body.SalesAccountID, body.ReceivableAccountID, body.CashAccountID, body.CardAccountID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save settings.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "pos.settings.update", "pos_settings", &tu.TenantID, nil, body)
		s, err := loadPosSettings(pool, r, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load settings.", "ERR_INTERNAL")
			return
		}
		response.OK(w, s, "Saved.")
	}
}
