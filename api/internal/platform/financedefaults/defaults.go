package financedefaults

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Role identifies a tenant-level default GL account slot.
type Role string

const (
	RoleCash                      Role = "cash"
	RoleReceivable                Role = "receivable"
	RolePayable                   Role = "payable"
	RoleSales                     Role = "sales"
	RolePurchase                  Role = "purchase"
	RoleInputVAT                  Role = "input_vat"
	RoleOutputVAT                 Role = "output_vat"
	RoleCommissionExpense         Role = "commission_expense"
	RoleCommissionPayable         Role = "commission_payable"
	RoleEWTPayable                Role = "ewt_payable"
	RoleFWTPayable                Role = "fwt_payable"
	RoleCompensationWHTPayable    Role = "compensation_wht_payable"
	RoleEWTReceivable             Role = "ewt_receivable"
	RoleInventory                 Role = "inventory"
	RoleGRNI                      Role = "grni"
	RoleCOGS                      Role = "cogs"
)

// Defaults holds tenant finance default account ids.
type Defaults struct {
	TenantID                    int64    `json:"tenant_id"`
	CashAccountID               *int64   `json:"cash_account_id,omitempty"`
	ReceivableAccountID         *int64   `json:"receivable_account_id,omitempty"`
	PayableAccountID            *int64   `json:"payable_account_id,omitempty"`
	SalesAccountID              *int64   `json:"sales_account_id,omitempty"`
	PurchaseAccountID           *int64   `json:"purchase_account_id,omitempty"`
	InputVATAccountID           *int64   `json:"input_vat_account_id,omitempty"`
	OutputVATAccountID          *int64   `json:"output_vat_account_id,omitempty"`
	CommissionExpenseAccountID         *int64   `json:"commission_expense_account_id,omitempty"`
	CommissionPayableAccountID         *int64   `json:"commission_payable_account_id,omitempty"`
	EWTPayableAccountID                *int64   `json:"ewt_payable_account_id,omitempty"`
	FWTPayableAccountID                *int64   `json:"fwt_payable_account_id,omitempty"`
	CompensationWHTPayableAccountID    *int64   `json:"compensation_wht_payable_account_id,omitempty"`
	EWTReceivableAccountID             *int64   `json:"ewt_receivable_account_id,omitempty"`
	AutoPostCommissionJournal          bool     `json:"auto_post_commission_journal"`
	DisabledAccountTypes               []string `json:"disabled_account_types,omitempty"`
	RDOCode                            *string  `json:"rdo_code,omitempty"`
	TaxRegime                          *string  `json:"tax_regime,omitempty"`
	RegistrationDate                   *string  `json:"registration_date,omitempty"`
	LineOfBusiness                     *string  `json:"line_of_business,omitempty"`
	CORFileURL                         *string  `json:"cor_file_url,omitempty"`
	CASFileURL                         *string  `json:"cas_file_url,omitempty"`
	ATPFileURL                         *string  `json:"atp_file_url,omitempty"`
	RetainedEarningsAccountID          *int64   `json:"retained_earnings_account_id,omitempty"`
	InventoryAccountID                 *int64   `json:"inventory_account_id,omitempty"`
	GRNIAccountID                      *int64   `json:"grni_account_id,omitempty"`
	COGSAccountID                      *int64   `json:"cogs_account_id,omitempty"`
}

var fallbackCodes = map[Role]string{
	RoleCash:                   "1020",
	RoleReceivable:             "1089",
	RolePayable:                "2519",
	RoleSales:                  "4019",
	RolePurchase:               "310",
	RoleInputVAT:               "1359",
	RoleOutputVAT:              "2559",
	RoleCommissionExpense:      "5105",
	RoleCommissionPayable:      "2020",
	RoleEWTPayable:             "2360",
	RoleFWTPayable:             "2360",
	RoleCompensationWHTPayable: "2051",
	RoleEWTReceivable:          "1140",
	RoleInventory:              "1469",
	RoleGRNI:                   "2519",
	RoleCOGS:                   "310",
}

var phCodes = map[Role]string{
	RoleCash:              "1010",
	RoleReceivable:        "1100",
	RolePayable:           "2010",
	RoleSales:             "4010",
	RolePurchase:          "5010",
	RoleInputVAT:          "1310",
	RoleOutputVAT:         "2030",
	RoleCommissionExpense:      "5105",
	RoleCommissionPayable:      "2020",
	RoleEWTPayable:             "2040",
	RoleFWTPayable:             "2040",
	RoleCompensationWHTPayable: "2051",
	RoleEWTReceivable:          "1315",
	RoleInventory:              "1200",
	RoleGRNI:                   "2115",
	RoleCOGS:                   "5010",
}

func roleID(d Defaults, role Role) *int64 {
	switch role {
	case RoleCash:
		return d.CashAccountID
	case RoleReceivable:
		return d.ReceivableAccountID
	case RolePayable:
		return d.PayableAccountID
	case RoleSales:
		return d.SalesAccountID
	case RolePurchase:
		return d.PurchaseAccountID
	case RoleInputVAT:
		return d.InputVATAccountID
	case RoleOutputVAT:
		return d.OutputVATAccountID
	case RoleCommissionExpense:
		return d.CommissionExpenseAccountID
	case RoleCommissionPayable:
		return d.CommissionPayableAccountID
	case RoleEWTPayable:
		return d.EWTPayableAccountID
	case RoleFWTPayable:
		return d.FWTPayableAccountID
	case RoleCompensationWHTPayable:
		return d.CompensationWHTPayableAccountID
	case RoleEWTReceivable:
		return d.EWTReceivableAccountID
	case RoleInventory:
		return d.InventoryAccountID
	case RoleGRNI:
		return d.GRNIAccountID
	case RoleCOGS:
		return d.COGSAccountID
	default:
		return nil
	}
}

type querier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// Load reads tenant finance defaults (empty struct when none saved).
func Load(ctx context.Context, q querier, tenantID int64) (Defaults, error) {
	var d Defaults
	d.TenantID = tenantID
	err := q.QueryRow(ctx, `
		select cash_account_id, receivable_account_id, payable_account_id,
		  sales_account_id, purchase_account_id, input_vat_account_id, output_vat_account_id,
		  commission_expense_account_id, commission_payable_account_id,
		  ewt_payable_account_id, fwt_payable_account_id, compensation_wht_payable_account_id, ewt_receivable_account_id,
		  coalesce(auto_post_commission_journal, false),
		  coalesce(disabled_account_types, '{}'),
		  rdo_code, tax_regime, registration_date::text, line_of_business, cor_file_url,
		  cas_file_url, atp_file_url, retained_earnings_account_id,
		  inventory_account_id, grni_account_id, cogs_account_id
		from public.tenant_finance_defaults
		where tenant_id = $1`, tenantID).Scan(
		&d.CashAccountID, &d.ReceivableAccountID, &d.PayableAccountID,
		&d.SalesAccountID, &d.PurchaseAccountID, &d.InputVATAccountID, &d.OutputVATAccountID,
		&d.CommissionExpenseAccountID, &d.CommissionPayableAccountID,
		&d.EWTPayableAccountID, &d.FWTPayableAccountID, &d.CompensationWHTPayableAccountID, &d.EWTReceivableAccountID,
		&d.AutoPostCommissionJournal, &d.DisabledAccountTypes,
		&d.RDOCode, &d.TaxRegime, &d.RegistrationDate, &d.LineOfBusiness, &d.CORFileURL,
		&d.CASFileURL, &d.ATPFileURL, &d.RetainedEarningsAccountID,
		&d.InventoryAccountID, &d.GRNIAccountID, &d.COGSAccountID,
	)
	if err != nil && strings.Contains(err.Error(), "inventory_account_id") {
		err = q.QueryRow(ctx, `
			select cash_account_id, receivable_account_id, payable_account_id,
			  sales_account_id, purchase_account_id, input_vat_account_id, output_vat_account_id,
			  commission_expense_account_id, commission_payable_account_id,
			  ewt_payable_account_id, fwt_payable_account_id, compensation_wht_payable_account_id, ewt_receivable_account_id,
			  coalesce(auto_post_commission_journal, false),
			  coalesce(disabled_account_types, '{}'),
			  rdo_code, tax_regime, registration_date::text, line_of_business, cor_file_url,
			  cas_file_url, atp_file_url, retained_earnings_account_id
			from public.tenant_finance_defaults
			where tenant_id = $1`, tenantID).Scan(
			&d.CashAccountID, &d.ReceivableAccountID, &d.PayableAccountID,
			&d.SalesAccountID, &d.PurchaseAccountID, &d.InputVATAccountID, &d.OutputVATAccountID,
			&d.CommissionExpenseAccountID, &d.CommissionPayableAccountID,
			&d.EWTPayableAccountID, &d.FWTPayableAccountID, &d.CompensationWHTPayableAccountID, &d.EWTReceivableAccountID,
			&d.AutoPostCommissionJournal, &d.DisabledAccountTypes,
			&d.RDOCode, &d.TaxRegime, &d.RegistrationDate, &d.LineOfBusiness, &d.CORFileURL,
			&d.CASFileURL, &d.ATPFileURL, &d.RetainedEarningsAccountID,
		)
	}
	if err != nil {
		// Migration 224 not applied — load without BIR statutory columns.
		if strings.Contains(err.Error(), "ewt_payable_account_id") ||
			strings.Contains(err.Error(), "rdo_code") ||
			strings.Contains(err.Error(), "cas_file_url") {
			err = q.QueryRow(ctx, `
				select cash_account_id, receivable_account_id, payable_account_id,
				  sales_account_id, purchase_account_id, input_vat_account_id, output_vat_account_id,
				  commission_expense_account_id, commission_payable_account_id,
				  coalesce(auto_post_commission_journal, false),
				  coalesce(disabled_account_types, '{}')
				from public.tenant_finance_defaults
				where tenant_id = $1`, tenantID).Scan(
				&d.CashAccountID, &d.ReceivableAccountID, &d.PayableAccountID,
				&d.SalesAccountID, &d.PurchaseAccountID, &d.InputVATAccountID, &d.OutputVATAccountID,
				&d.CommissionExpenseAccountID, &d.CommissionPayableAccountID, &d.AutoPostCommissionJournal,
				&d.DisabledAccountTypes,
			)
		}
		if err != nil && (strings.Contains(err.Error(), "commission_expense_account_id") ||
			strings.Contains(err.Error(), "auto_post_commission_journal") ||
			strings.Contains(err.Error(), "commission_payable_account_id")) {
			err = q.QueryRow(ctx, `
				select cash_account_id, receivable_account_id, payable_account_id,
				  sales_account_id, purchase_account_id, input_vat_account_id, output_vat_account_id,
				  coalesce(disabled_account_types, '{}')
				from public.tenant_finance_defaults
				where tenant_id = $1`, tenantID).Scan(
				&d.CashAccountID, &d.ReceivableAccountID, &d.PayableAccountID,
				&d.SalesAccountID, &d.PurchaseAccountID, &d.InputVATAccountID, &d.OutputVATAccountID,
				&d.DisabledAccountTypes,
			)
		}
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return d, nil
	}
	if d.DisabledAccountTypes == nil {
		d.DisabledAccountTypes = []string{}
	}
	return d, err
}

// Save upserts tenant finance defaults.
func Save(ctx context.Context, pool *pgxpool.Pool, tenantID int64, d Defaults) error {
	types := d.DisabledAccountTypes
	if types == nil {
		types = []string{}
	}
	_, err := pool.Exec(ctx, `
		insert into public.tenant_finance_defaults (
		  tenant_id, cash_account_id, receivable_account_id, payable_account_id,
		  sales_account_id, purchase_account_id, input_vat_account_id, output_vat_account_id,
		  commission_expense_account_id, commission_payable_account_id,
		  ewt_payable_account_id, fwt_payable_account_id, compensation_wht_payable_account_id, ewt_receivable_account_id,
		  auto_post_commission_journal, disabled_account_types,
		  rdo_code, tax_regime, registration_date, line_of_business, cor_file_url,
		  cas_file_url, atp_file_url, retained_earnings_account_id,
		  inventory_account_id, grni_account_id, cogs_account_id
		) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
		on conflict (tenant_id) do update set
		  cash_account_id = excluded.cash_account_id,
		  receivable_account_id = excluded.receivable_account_id,
		  payable_account_id = excluded.payable_account_id,
		  sales_account_id = excluded.sales_account_id,
		  purchase_account_id = excluded.purchase_account_id,
		  input_vat_account_id = excluded.input_vat_account_id,
		  output_vat_account_id = excluded.output_vat_account_id,
		  commission_expense_account_id = excluded.commission_expense_account_id,
		  commission_payable_account_id = excluded.commission_payable_account_id,
		  ewt_payable_account_id = excluded.ewt_payable_account_id,
		  fwt_payable_account_id = excluded.fwt_payable_account_id,
		  compensation_wht_payable_account_id = excluded.compensation_wht_payable_account_id,
		  ewt_receivable_account_id = excluded.ewt_receivable_account_id,
		  auto_post_commission_journal = excluded.auto_post_commission_journal,
		  disabled_account_types = excluded.disabled_account_types,
		  rdo_code = excluded.rdo_code,
		  tax_regime = excluded.tax_regime,
		  registration_date = excluded.registration_date,
		  line_of_business = excluded.line_of_business,
		  cor_file_url = excluded.cor_file_url,
		  cas_file_url = excluded.cas_file_url,
		  atp_file_url = excluded.atp_file_url,
		  retained_earnings_account_id = excluded.retained_earnings_account_id,
		  inventory_account_id = excluded.inventory_account_id,
		  grni_account_id = excluded.grni_account_id,
		  cogs_account_id = excluded.cogs_account_id,
		  updated_at = now()`,
		tenantID, d.CashAccountID, d.ReceivableAccountID, d.PayableAccountID,
		d.SalesAccountID, d.PurchaseAccountID, d.InputVATAccountID, d.OutputVATAccountID,
		d.CommissionExpenseAccountID, d.CommissionPayableAccountID,
		d.EWTPayableAccountID, d.FWTPayableAccountID, d.CompensationWHTPayableAccountID, d.EWTReceivableAccountID,
		d.AutoPostCommissionJournal, types,
		d.RDOCode, d.TaxRegime, d.RegistrationDate, d.LineOfBusiness, d.CORFileURL,
		d.CASFileURL, d.ATPFileURL, d.RetainedEarningsAccountID,
		d.InventoryAccountID, d.GRNIAccountID, d.COGSAccountID,
	)
	return err
}

// ResolveByRole returns an active account id: tenant default, then PH code, then legacy fallback code.
func ResolveByRole(ctx context.Context, q querier, tenantID int64, role Role) (int64, error) {
	d, err := Load(ctx, q, tenantID)
	if err != nil {
		return 0, err
	}
	if id := roleID(d, role); id != nil && *id > 0 {
		var ok int64
		if err := q.QueryRow(ctx, `
			select id from public.fin_accounts
			where id = $1 and tenant_id = $2 and is_active and deleted_at is null`,
			*id, tenantID).Scan(&ok); err == nil {
			return ok, nil
		}
	}
	if code, ok := phCodes[role]; ok {
		if id, err := resolveByCode(ctx, q, tenantID, code); err == nil {
			return id, nil
		}
	}
	if code, ok := fallbackCodes[role]; ok {
		return resolveByCode(ctx, q, tenantID, code)
	}
	return 0, errors.New("no default account for role " + string(role))
}

// ResolveByCode resolves by explicit code (checks tenant default mapping for known codes first).
func ResolveByCode(ctx context.Context, q querier, tenantID int64, code string) (int64, error) {
	if role := codeToRole(code); role != "" {
		if id, err := ResolveByRole(ctx, q, tenantID, role); err == nil {
			return id, nil
		}
	}
	return resolveByCode(ctx, q, tenantID, code)
}

func codeToRole(code string) Role {
	for role, legacy := range fallbackCodes {
		if legacy == code {
			return role
		}
	}
	for role, ph := range phCodes {
		if ph == code {
			return role
		}
	}
	return ""
}

func resolveByCode(ctx context.Context, q querier, tenantID int64, code string) (int64, error) {
	var id int64
	err := q.QueryRow(ctx, `
		select id from public.fin_accounts
		where tenant_id = $1 and account_code = $2 and is_active and deleted_at is null`,
		tenantID, code).Scan(&id)
	return id, err
}

// HasMinimumCoreAccounts reports whether the tenant has enough accounts to pass setup.
// Requires at least one active account in each of the core types (asset, liability, income, expense).
// minCount is a floor on total active accounts (typically 4 when requiring all four types).
func HasMinimumCoreAccounts(ctx context.Context, pool *pgxpool.Pool, tenantID int64, minCount, minTypes int) (bool, error) {
	var count int
	if err := pool.QueryRow(ctx, `
		select count(*)::int from public.fin_accounts
		where tenant_id = $1 and deleted_at is null and is_active`, tenantID).Scan(&count); err != nil {
		return false, err
	}
	if count < minCount {
		return false, nil
	}
	var types int
	if err := pool.QueryRow(ctx, `
		select count(distinct account_type)::int from public.fin_accounts
		where tenant_id = $1 and deleted_at is null and is_active
		  and account_type in ('asset','liability','income','expense')`, tenantID).Scan(&types); err != nil {
		return false, err
	}
	return types >= minTypes, nil
}
