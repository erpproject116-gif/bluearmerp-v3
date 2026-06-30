package processpolicy

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Policy holds tenant-level commercial flow gates (skip-friendly defaults).
type Policy struct {
	TenantID                            int64 `json:"tenant_id"`
	SalesRequireQuotation               bool  `json:"sales_require_quotation"`
	SalesRequireSO                      bool  `json:"sales_require_so"`
	SalesRequireReservation             bool  `json:"sales_require_reservation"`
	SalesRequireDeliveryReceipt         bool  `json:"sales_require_delivery_receipt"`
	PurchaseRequirePR                   bool  `json:"purchase_require_pr"`
	PurchaseRequirePRApproval           bool  `json:"purchase_require_pr_approval"`
	PurchaseRequireGRBeforeSupplierInv  bool  `json:"purchase_require_gr_before_supplier_invoice"`
	LegacyCombinedSORelease             bool  `json:"legacy_combined_so_release"`
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
  legacy_combined_so_release
`

// Load returns the tenant policy, inserting skip-friendly defaults when missing.
func Load(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (Policy, error) {
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
	)
	return p, err
}

// Update merges a patch into the stored policy.
func Update(ctx context.Context, pool *pgxpool.Pool, tenantID, userID int64, patch Patch) (Policy, error) {
	current, err := Load(ctx, pool, tenantID)
	if err != nil {
		return Policy{}, err
	}

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

	_, err = pool.Exec(ctx, `
		update public.tenant_process_policies set
		  sales_require_quotation = $2,
		  sales_require_so = $3,
		  sales_require_reservation = $4,
		  sales_require_delivery_receipt = $5,
		  purchase_require_pr = $6,
		  purchase_require_pr_approval = $7,
		  purchase_require_gr_before_supplier_invoice = $8,
		  legacy_combined_so_release = $9,
		  updated_by_user_id = $10,
		  updated_at = now()
		where tenant_id = $1`,
		tenantID,
		next.SalesRequireQuotation,
		next.SalesRequireSO,
		next.SalesRequireReservation,
		next.SalesRequireDeliveryReceipt,
		next.PurchaseRequirePR,
		next.PurchaseRequirePRApproval,
		next.PurchaseRequireGRBeforeSupplierInv,
		next.LegacyCombinedSORelease,
		userID,
	)
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

// LoadTx loads policy inside an existing transaction.
func LoadTx(ctx context.Context, tx pgx.Tx, tenantID int64) (Policy, error) {
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
	)
	return p, err
}
