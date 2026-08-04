package processpolicy

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Policy holds tenant-level commercial flow gates (skip-friendly defaults).
type Policy struct {
	TenantID                            int64  `json:"tenant_id"`
	SalesRequireQuotation               bool   `json:"sales_require_quotation"`
	SalesRequireSO                      bool   `json:"sales_require_so"`
	SalesRequireReservation             bool   `json:"sales_require_reservation"`
	SalesRequireDeliveryReceipt         bool   `json:"sales_require_delivery_receipt"`
	PurchaseRequirePR                   bool   `json:"purchase_require_pr"`
	PurchaseRequirePRApproval           bool   `json:"purchase_require_pr_approval"`
	PurchaseRequireGRBeforeSupplierInv  bool   `json:"purchase_require_gr_before_supplier_invoice"`
	LegacyCombinedSORelease             bool   `json:"legacy_combined_so_release"`
	SalesEnforceCreditLimit             bool   `json:"sales_enforce_credit_limit"`
	AccountsAutoPostOR                  bool   `json:"accounts_auto_post_or"`
	AccountsAutoPostPV                  bool   `json:"accounts_auto_post_pv"`
	AccountsAutoPostSales               bool   `json:"accounts_auto_post_sales"`
	AccountsAutoPostPurchase            bool   `json:"accounts_auto_post_purchase"`
	SalesRequireSOApproval              bool   `json:"sales_require_so_approval"`
	PurchaseRequirePOApproval           bool   `json:"purchase_require_po_approval"`
	FinanceRequireJEApproval            bool   `json:"finance_require_je_approval"`
	BudgetControlMode                   string `json:"budget_control_mode"`
	QuotationRequireAttachment          bool   `json:"quotation_require_attachment"`
	SalesOrderRequireAttachment         bool   `json:"sales_order_require_attachment"`
	SalesRequireAttachment              bool   `json:"sales_require_attachment"`
	PurchaseOrderRequireAttachment      bool   `json:"purchase_order_require_attachment"`
	SupplierInvoiceRequireAttachment    bool   `json:"supplier_invoice_require_attachment"`
	InventoryGLHybridEnabled            bool   `json:"inventory_gl_hybrid_enabled"`
}

// Patch is the writable subset for PATCH/PUT requests.
type Patch struct {
	SalesRequireQuotation              *bool `json:"sales_require_quotation,omitempty"`
	SalesRequireSO                     *bool `json:"sales_require_so,omitempty"`
	SalesRequireReservation            *bool `json:"sales_require_reservation,omitempty"`
	SalesRequireDeliveryReceipt        *bool `json:"sales_require_delivery_receipt,omitempty"`
	PurchaseRequirePR                  *bool `json:"purchase_require_pr,omitempty"`
	PurchaseRequirePRApproval          *bool `json:"purchase_require_pr_approval,omitempty"`
	PurchaseRequireGRBeforeSupplierInv *bool `json:"purchase_require_gr_before_supplier_invoice,omitempty"`
	LegacyCombinedSORelease            *bool `json:"legacy_combined_so_release,omitempty"`
	SalesEnforceCreditLimit            *bool `json:"sales_enforce_credit_limit,omitempty"`
	AccountsAutoPostOR                 *bool   `json:"accounts_auto_post_or,omitempty"`
	AccountsAutoPostPV                 *bool   `json:"accounts_auto_post_pv,omitempty"`
	AccountsAutoPostSales              *bool   `json:"accounts_auto_post_sales,omitempty"`
	AccountsAutoPostPurchase           *bool   `json:"accounts_auto_post_purchase,omitempty"`
	SalesRequireSOApproval             *bool   `json:"sales_require_so_approval,omitempty"`
	PurchaseRequirePOApproval          *bool   `json:"purchase_require_po_approval,omitempty"`
	FinanceRequireJEApproval           *bool   `json:"finance_require_je_approval,omitempty"`
	BudgetControlMode                  *string `json:"budget_control_mode,omitempty"`
	QuotationRequireAttachment         *bool   `json:"quotation_require_attachment,omitempty"`
	SalesOrderRequireAttachment        *bool   `json:"sales_order_require_attachment,omitempty"`
	SalesRequireAttachment             *bool   `json:"sales_require_attachment,omitempty"`
	PurchaseOrderRequireAttachment     *bool   `json:"purchase_order_require_attachment,omitempty"`
	SupplierInvoiceRequireAttachment   *bool   `json:"supplier_invoice_require_attachment,omitempty"`
	InventoryGLHybridEnabled           *bool   `json:"inventory_gl_hybrid_enabled,omitempty"`
}

var ErrNotFound = errors.New("process policy not found")

const selectCols = `
  tenant_id,
  sales_require_quotation,
  sales_require_so,
  sales_require_reservation,
  sales_require_delivery_receipt,
  purchase_require_pr,
  purchase_require_pr_approval,
  purchase_require_gr_before_supplier_invoice,
  legacy_combined_so_release,
  sales_enforce_credit_limit,
  accounts_auto_post_or,
  accounts_auto_post_pv,
  coalesce(accounts_auto_post_sales, false),
  coalesce(accounts_auto_post_purchase, false),
  coalesce(sales_require_so_approval, false),
  coalesce(purchase_require_po_approval, false),
  coalesce(finance_require_je_approval, false),
  coalesce(budget_control_mode, 'off'),
  coalesce(quotation_require_attachment, false),
  coalesce(sales_order_require_attachment, true),
  coalesce(sales_require_attachment, true),
  coalesce(purchase_order_require_attachment, true),
  coalesce(supplier_invoice_require_attachment, true),
  coalesce(inventory_gl_hybrid_enabled, false)
`

// LoadStored returns the tenant policy as stored (for admin UI), inserting defaults when missing.
func LoadStored(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (Policy, error) {
	_, err := pool.Exec(ctx, `
		insert into public.tenant_process_policies (tenant_id)
		values ($1)
		on conflict (tenant_id) do nothing`, tenantID)
	if err != nil {
		return Policy{}, err
	}

	var p Policy
	err = pool.QueryRow(ctx, `
		select `+selectCols+`
		from public.tenant_process_policies
		where tenant_id = $1`, tenantID).Scan(
		&p.TenantID,
		&p.SalesRequireQuotation,
		&p.SalesRequireSO,
		&p.SalesRequireReservation,
		&p.SalesRequireDeliveryReceipt,
		&p.PurchaseRequirePR,
		&p.PurchaseRequirePRApproval,
		&p.PurchaseRequireGRBeforeSupplierInv,
		&p.LegacyCombinedSORelease,
		&p.SalesEnforceCreditLimit,
		&p.AccountsAutoPostOR,
		&p.AccountsAutoPostPV,
		&p.AccountsAutoPostSales,
		&p.AccountsAutoPostPurchase,
		&p.SalesRequireSOApproval,
		&p.PurchaseRequirePOApproval,
		&p.FinanceRequireJEApproval,
		&p.BudgetControlMode,
		&p.QuotationRequireAttachment,
		&p.SalesOrderRequireAttachment,
		&p.SalesRequireAttachment,
		&p.PurchaseOrderRequireAttachment,
		&p.SupplierInvoiceRequireAttachment,
		&p.InventoryGLHybridEnabled,
	)
	return p, err
}

// BypassFromStored returns a policy with all require-* gates off while preserving
// non-gate settings (auto-post accounting, legacy SO release) from the stored row.
func BypassFromStored(stored Policy) Policy {
	out := stored
	out.SalesRequireQuotation = false
	out.SalesRequireSO = false
	out.SalesRequireReservation = false
	out.SalesRequireDeliveryReceipt = false
	out.PurchaseRequirePR = false
	out.PurchaseRequirePRApproval = false
	out.PurchaseRequireGRBeforeSupplierInv = false
	out.SalesEnforceCreditLimit = false
	out.SalesRequireSOApproval = false
	out.PurchaseRequirePOApproval = false
	out.FinanceRequireJEApproval = false
	out.BudgetControlMode = "off"
	out.QuotationRequireAttachment = false
	out.SalesOrderRequireAttachment = false
	out.SalesRequireAttachment = false
	out.PurchaseOrderRequireAttachment = false
	out.SupplierInvoiceRequireAttachment = false
	return out
}

// BypassPolicy is a fully relaxed policy when no stored row is available.
func BypassPolicy(tenantID int64) Policy {
	return BypassFromStored(Policy{TenantID: tenantID, LegacyCombinedSORelease: true, BudgetControlMode: "off"})
}

// ModuleEnabled reports whether process policy enforcement is on for the tenant.
// Missing tenant_modules row is treated as enabled (legacy / pre-migration safe).
func ModuleEnabled(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (bool, error) {
	var enabled bool
	err := pool.QueryRow(ctx, `
		select is_enabled from public.tenant_modules
		where tenant_id = $1 and module_code = 'process_policies'`, tenantID).Scan(&enabled)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return true, nil
		}
		return false, err
	}
	return enabled, nil
}

// Load returns the effective policy for transaction enforcement.
// When the process_policies module is off, require-* gates are bypassed.
func Load(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (Policy, error) {
	stored, err := LoadStored(ctx, pool, tenantID)
	if err != nil {
		return Policy{}, err
	}
	on, err := ModuleEnabled(ctx, pool, tenantID)
	if err != nil {
		return Policy{}, err
	}
	if !on {
		return BypassFromStored(stored), nil
	}
	return stored, nil
}

// ApplyPatch merges non-nil patch fields onto current.
func ApplyPatch(current Policy, patch Patch) Policy {
	next := current
	if patch.SalesRequireQuotation != nil {
		next.SalesRequireQuotation = *patch.SalesRequireQuotation
	}
	if patch.SalesRequireSO != nil {
		next.SalesRequireSO = *patch.SalesRequireSO
	}
	if patch.SalesRequireReservation != nil {
		next.SalesRequireReservation = *patch.SalesRequireReservation
	}
	if patch.SalesRequireDeliveryReceipt != nil {
		next.SalesRequireDeliveryReceipt = *patch.SalesRequireDeliveryReceipt
	}
	if patch.PurchaseRequirePR != nil {
		next.PurchaseRequirePR = *patch.PurchaseRequirePR
	}
	if patch.PurchaseRequirePRApproval != nil {
		next.PurchaseRequirePRApproval = *patch.PurchaseRequirePRApproval
	}
	if patch.PurchaseRequireGRBeforeSupplierInv != nil {
		next.PurchaseRequireGRBeforeSupplierInv = *patch.PurchaseRequireGRBeforeSupplierInv
	}
	if patch.LegacyCombinedSORelease != nil {
		next.LegacyCombinedSORelease = *patch.LegacyCombinedSORelease
	}
	if patch.SalesEnforceCreditLimit != nil {
		next.SalesEnforceCreditLimit = *patch.SalesEnforceCreditLimit
	}
	if patch.AccountsAutoPostOR != nil {
		next.AccountsAutoPostOR = *patch.AccountsAutoPostOR
	}
	if patch.AccountsAutoPostPV != nil {
		next.AccountsAutoPostPV = *patch.AccountsAutoPostPV
	}
	if patch.AccountsAutoPostSales != nil {
		next.AccountsAutoPostSales = *patch.AccountsAutoPostSales
	}
	if patch.AccountsAutoPostPurchase != nil {
		next.AccountsAutoPostPurchase = *patch.AccountsAutoPostPurchase
	}
	if patch.SalesRequireSOApproval != nil {
		next.SalesRequireSOApproval = *patch.SalesRequireSOApproval
	}
	if patch.PurchaseRequirePOApproval != nil {
		next.PurchaseRequirePOApproval = *patch.PurchaseRequirePOApproval
	}
	if patch.FinanceRequireJEApproval != nil {
		next.FinanceRequireJEApproval = *patch.FinanceRequireJEApproval
	}
	if patch.BudgetControlMode != nil {
		mode := strings.TrimSpace(*patch.BudgetControlMode)
		if mode == "warn" || mode == "block" {
			next.BudgetControlMode = mode
		} else {
			next.BudgetControlMode = "off"
		}
	}
	if patch.QuotationRequireAttachment != nil {
		next.QuotationRequireAttachment = *patch.QuotationRequireAttachment
	}
	if patch.SalesOrderRequireAttachment != nil {
		next.SalesOrderRequireAttachment = *patch.SalesOrderRequireAttachment
	}
	if patch.SalesRequireAttachment != nil {
		next.SalesRequireAttachment = *patch.SalesRequireAttachment
	}
	if patch.PurchaseOrderRequireAttachment != nil {
		next.PurchaseOrderRequireAttachment = *patch.PurchaseOrderRequireAttachment
	}
	if patch.SupplierInvoiceRequireAttachment != nil {
		next.SupplierInvoiceRequireAttachment = *patch.SupplierInvoiceRequireAttachment
	}
	if patch.InventoryGLHybridEnabled != nil {
		next.InventoryGLHybridEnabled = *patch.InventoryGLHybridEnabled
	}
	return next
}

func writePolicyArgs(tenantID, userID int64, next Policy) []any {
	return []any{
		tenantID,
		next.SalesRequireQuotation,
		next.SalesRequireSO,
		next.SalesRequireReservation,
		next.SalesRequireDeliveryReceipt,
		next.PurchaseRequirePR,
		next.PurchaseRequirePRApproval,
		next.PurchaseRequireGRBeforeSupplierInv,
		next.LegacyCombinedSORelease,
		next.SalesEnforceCreditLimit,
		next.AccountsAutoPostOR,
		next.AccountsAutoPostPV,
		next.AccountsAutoPostSales,
		next.AccountsAutoPostPurchase,
		next.SalesRequireSOApproval,
		next.PurchaseRequirePOApproval,
		next.FinanceRequireJEApproval,
		next.BudgetControlMode,
		next.QuotationRequireAttachment,
		next.SalesOrderRequireAttachment,
		next.SalesRequireAttachment,
		next.PurchaseOrderRequireAttachment,
		next.SupplierInvoiceRequireAttachment,
		next.InventoryGLHybridEnabled,
		userID,
	}
}

const updatePolicySQL = `
		update public.tenant_process_policies set
		  sales_require_quotation = $2,
		  sales_require_so = $3,
		  sales_require_reservation = $4,
		  sales_require_delivery_receipt = $5,
		  purchase_require_pr = $6,
		  purchase_require_pr_approval = $7,
		  purchase_require_gr_before_supplier_invoice = $8,
		  legacy_combined_so_release = $9,
		  sales_enforce_credit_limit = $10,
		  accounts_auto_post_or = $11,
		  accounts_auto_post_pv = $12,
		  accounts_auto_post_sales = $13,
		  accounts_auto_post_purchase = $14,
		  sales_require_so_approval = $15,
		  purchase_require_po_approval = $16,
		  finance_require_je_approval = $17,
		  budget_control_mode = $18,
		  quotation_require_attachment = $19,
		  sales_order_require_attachment = $20,
		  sales_require_attachment = $21,
		  purchase_order_require_attachment = $22,
		  supplier_invoice_require_attachment = $23,
		  inventory_gl_hybrid_enabled = $24,
		  updated_by_user_id = $25,
		  updated_at = now()
		where tenant_id = $1`

// Update merges a patch into the stored policy.
func Update(ctx context.Context, pool *pgxpool.Pool, tenantID, userID int64, patch Patch) (Policy, error) {
	current, err := LoadStored(ctx, pool, tenantID)
	if err != nil {
		return Policy{}, err
	}
	next := ApplyPatch(current, patch)
	_, err = pool.Exec(ctx, updatePolicySQL, writePolicyArgs(tenantID, userID, next)...)
	if err != nil {
		return Policy{}, err
	}
	return next, nil
}

// UpdateTx merges a patch inside an existing transaction.
func UpdateTx(ctx context.Context, tx pgx.Tx, tenantID, userID int64, patch Patch) (Policy, error) {
	current, err := loadStoredTx(ctx, tx, tenantID)
	if err != nil {
		return Policy{}, err
	}
	next := ApplyPatch(current, patch)
	_, err = tx.Exec(ctx, updatePolicySQL, writePolicyArgs(tenantID, userID, next)...)
	if err != nil {
		return Policy{}, err
	}
	return next, nil
}

// DecodePatch parses JSON body into Patch.
func DecodePatch(raw json.RawMessage) (Patch, error) {
	var p Patch
	if len(raw) == 0 {
		return p, nil
	}
	err := json.Unmarshal(raw, &p)
	return p, err
}

func loadStoredTx(ctx context.Context, tx pgx.Tx, tenantID int64) (Policy, error) {
	_, err := tx.Exec(ctx, `
		insert into public.tenant_process_policies (tenant_id)
		values ($1)
		on conflict (tenant_id) do nothing`, tenantID)
	if err != nil {
		return Policy{}, err
	}

	var p Policy
	err = tx.QueryRow(ctx, `
		select `+selectCols+`
		from public.tenant_process_policies
		where tenant_id = $1`, tenantID).Scan(
		&p.TenantID,
		&p.SalesRequireQuotation,
		&p.SalesRequireSO,
		&p.SalesRequireReservation,
		&p.SalesRequireDeliveryReceipt,
		&p.PurchaseRequirePR,
		&p.PurchaseRequirePRApproval,
		&p.PurchaseRequireGRBeforeSupplierInv,
		&p.LegacyCombinedSORelease,
		&p.SalesEnforceCreditLimit,
		&p.AccountsAutoPostOR,
		&p.AccountsAutoPostPV,
		&p.AccountsAutoPostSales,
		&p.AccountsAutoPostPurchase,
		&p.SalesRequireSOApproval,
		&p.PurchaseRequirePOApproval,
		&p.FinanceRequireJEApproval,
		&p.BudgetControlMode,
		&p.QuotationRequireAttachment,
		&p.SalesOrderRequireAttachment,
		&p.SalesRequireAttachment,
		&p.PurchaseOrderRequireAttachment,
		&p.SupplierInvoiceRequireAttachment,
		&p.InventoryGLHybridEnabled,
	)
	return p, err
}

// LoadTx loads the effective policy inside an existing transaction (module gate applied).
func LoadTx(ctx context.Context, tx pgx.Tx, tenantID int64) (Policy, error) {
	p, err := loadStoredTx(ctx, tx, tenantID)
	if err != nil {
		return Policy{}, err
	}
	var enabled bool
	err = tx.QueryRow(ctx, `
		select is_enabled from public.tenant_modules
		where tenant_id = $1 and module_code = 'process_policies'`, tenantID).Scan(&enabled)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return p, nil
		}
		return Policy{}, err
	}
	if !enabled {
		return BypassFromStored(p), nil
	}
	return p, nil
}
