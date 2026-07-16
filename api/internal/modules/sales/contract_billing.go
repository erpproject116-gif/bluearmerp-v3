package sales

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/invoicejournal"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/processpolicy"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/taxcalc"
)

const (
	contractReceivableCode = "1089"
	contractSalesCode      = "210"
)

var ErrContractMilestoneNotFound = errors.New("contract milestone not found")
var ErrContractMilestoneAlreadyBilled = errors.New("contract milestone already billed")

// CreateFromContractMilestone creates a sales invoice for a contract milestone amount.
// When autoPost is true the sale is created as completed and a draft/posted journal is synced when accounts are configured.
func CreateFromContractMilestone(ctx context.Context, pool *pgxpool.Pool, tenantID, milestoneID int64, userID *int64, autoPost bool) (int64, error) {
	var contractID, partnerID int64
	var contractNo, title, milestoneDesc string
	var milestoneNo int
	var amount float64
	var dueDate *time.Time
	var billedSaleID *int64
	var invProjectID, jobCostProjectID *int64
	var invProjectName *string

	err := pool.QueryRow(ctx, `
		select m.id, m.contract_id, m.milestone_no, m.description, m.due_date, m.amount::float8, m.billed_sale_id,
		  c.contract_no, c.title, c.partner_id, c.inv_project_id, c.job_cost_project_id, p.project_name
		from public.fin_contract_milestones m
		join public.fin_contracts c on c.id = m.contract_id
		left join public.inv_projects p on p.id = c.inv_project_id
		where m.id = $1 and c.tenant_id = $2 and c.status = 'active'`,
		milestoneID, tenantID).Scan(
		&milestoneID, &contractID, &milestoneNo, &milestoneDesc, &dueDate, &amount, &billedSaleID,
		&contractNo, &title, &partnerID, &invProjectID, &jobCostProjectID, &invProjectName,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, ErrContractMilestoneNotFound
		}
		return 0, err
	}
	if billedSaleID != nil && *billedSaleID > 0 {
		return *billedSaleID, ErrContractMilestoneAlreadyBilled
	}
	if amount <= 0 {
		return 0, fmt.Errorf("milestone amount must be positive")
	}

	var existingID int64
	err = pool.QueryRow(ctx, `
		select id from public.sa_sales
		where tenant_id = $1 and source_contract_milestone_id = $2 and deleted_at is null
		order by id desc limit 1`, tenantID, milestoneID).Scan(&existingID)
	if err == nil {
		return existingID, ErrContractMilestoneAlreadyBilled
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return 0, err
	}

	taxTypeID, currencyID, locationID, err := loadTenantSaleDefaults(ctx, pool, tenantID)
	if err != nil {
		return 0, err
	}

	tt, err := loadTaxCalcType(ctx, pool, tenantID, taxTypeID)
	if err != nil {
		return 0, fmt.Errorf("tax type not found: %w", err)
	}

	var serviceItemID *int64
	var itemCode, itemName string
	_ = pool.QueryRow(ctx, `
		select contract_billing_service_item_id
		from public.tenant_process_policies where tenant_id = $1`, tenantID).Scan(&serviceItemID)
	if serviceItemID != nil && *serviceItemID > 0 {
		_ = pool.QueryRow(ctx, `
			select item_code, item_name from public.inv_items
			where id = $1 and tenant_id = $2 and deleted_at is null`, *serviceItemID, tenantID).
			Scan(&itemCode, &itemName)
	}
	if strings.TrimSpace(itemCode) == "" {
		itemCode = "CONTRACT"
		itemName = "Contract billing"
	}

	lineDesc := fmt.Sprintf("%s — %s milestone %d: %s", contractNo, title, milestoneNo, milestoneDesc)
	lineBodies := []saleLineBody{{
		LineNo:      1,
		ItemID:      serviceItemID,
		ItemCode:    itemCode,
		ItemName:    itemName,
		Description: &lineDesc,
		Qty:         1,
		UnitPrice:   amount,
		InputBasis:  taxcalc.InputVatIncUnit,
	}}

	templateCode := defaultTemplateCode("")
	computed, errs := computeSaleLines(tt, templateCode, lineBodies)
	if errs != nil {
		return 0, fmt.Errorf("compute lines: %v", errs)
	}
	subtotal, taxTotal, grandTotal := sumSaleTotals(computed)

	orderDate := time.Now()
	if dueDate != nil && !dueDate.After(orderDate) {
		orderDate = *dueDate
	}

	progress := "unconfirmed"
	if autoPost {
		progress = "completed"
	}

	notes := fmt.Sprintf("Contract milestone billing — %s", contractNo)
	var projectName *string
	if invProjectName != nil && strings.TrimSpace(*invProjectName) != "" {
		projectName = invProjectName
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	var dateSeq int
	var salesNo string
	if err := tx.QueryRow(ctx,
		`select date_seq, sales_no from public.allocate_sales_sequences($1, $2::date)`,
		tenantID, orderDate).Scan(&dateSeq, &salesNo); err != nil {
		return 0, err
	}

	var id int64
	err = tx.QueryRow(ctx, `
		insert into public.sa_sales (
		  tenant_id, order_date, date_seq, sales_no,
		  tax_type_id, currency_id, partner_id,
		  location_id, project_id, project_name,
		  due_date, notes,
		  progress_status, template_code,
		  source_contract_milestone_id,
		  subtotal, tax_total, grand_total, created_by_user_id
		) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
		returning id`,
		tenantID, orderDate, dateSeq, salesNo,
		taxTypeID, currencyID, partnerID,
		locationID, invProjectID, projectName,
		dueDate, notes,
		progress, templateCode,
		milestoneID,
		subtotal, taxTotal, grandTotal, userID).Scan(&id)
	if err != nil {
		return 0, err
	}

	if err := insertSaleLines(ctx, tx, id, computed); err != nil {
		return 0, err
	}

	if serviceItemID != nil {
		if err := applySaleStock(ctx, tx, tenantID, id, locationID, derefInt64(userID)); err != nil {
			return 0, err
		}
	}

	if progress == "completed" {
		if err := accrueCommissionForSale(ctx, tx, tenantID, id); err != nil {
			return 0, err
		}
		if err := accrueSaleLineCommissions(ctx, tx, tenantID, id); err != nil {
			return 0, err
		}
		if err := postCommissionJournalForSale(ctx, tx, tenantID, derefInt64(userID), id); err != nil {
			return 0, err
		}
	}

	policy, _ := processpolicy.LoadTx(ctx, tx, tenantID)
	if progress == "completed" {
		if lines, salesAcctID, depositAcctID, ok := buildContractSaleJournal(ctx, tx, tenantID, partnerID, salesNo, subtotal, taxTotal, grandTotal); ok {
			jeID, err := invoicejournal.SyncTx(ctx, tx, tenantID, derefInt64(userID), orderDate, "Sales "+salesNo, nil, lines, policy.AccountsAutoPostSales)
			if err == nil {
				_, _ = tx.Exec(ctx, `
					update public.sa_sales
					set sales_account_id = $2, deposit_account_id = $3, invoice_journal_entry_id = $4, updated_at = now()
					where id = $1`, id, salesAcctID, depositAcctID, jeID)
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return id, nil
}

func buildContractSaleJournal(ctx context.Context, tx pgx.Tx, tenantID, partnerID int64, salesNo string, subtotal, taxTotal, grandTotal float64) ([]invoicejournal.Line, int64, int64, bool) {
	depositID, err := invoicejournal.ResolveAccountIDTx(ctx, tx, tenantID, contractReceivableCode)
	if err != nil {
		return nil, 0, 0, false
	}
	salesAcctID, err := invoicejournal.ResolveAccountIDTx(ctx, tx, tenantID, contractSalesCode)
	if err != nil {
		return nil, 0, 0, false
	}
	lines := []invoicejournal.Line{
		{AccountID: depositID, Debit: grandTotal, PartyID: &partnerID, Remark: "A/R - " + salesNo},
		{AccountID: salesAcctID, Credit: subtotal, Remark: "Sales - " + salesNo},
	}
	if taxTotal > 0 {
		if taxAcct, e := invoicejournal.ResolveAccountIDTx(ctx, tx, tenantID, salesTaxPayableCode); e == nil {
			lines = append(lines, invoicejournal.Line{AccountID: taxAcct, Credit: taxTotal, Remark: "Output VAT - " + salesNo})
		}
	}
	return lines, salesAcctID, depositID, true
}

func loadTenantSaleDefaults(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (taxTypeID, currencyID, locationID int64, err error) {
	err = pool.QueryRow(ctx, `
		select id from public.quo_tax_types
		where tenant_id = $1 and status = 'active'
		order by sort_order, id limit 1`, tenantID).Scan(&taxTypeID)
	if err != nil {
		return 0, 0, 0, fmt.Errorf("default tax type: %w", err)
	}
	err = pool.QueryRow(ctx, `
		select id from public.quo_currencies
		where tenant_id = $1 and status = 'active'
		order by is_default desc, id limit 1`, tenantID).Scan(&currencyID)
	if err != nil {
		return 0, 0, 0, fmt.Errorf("default currency: %w", err)
	}
	err = pool.QueryRow(ctx, `
		select id from public.inv_locations
		where tenant_id = $1 and status = 'active' and deleted_at is null
		order by location_code, id limit 1`, tenantID).Scan(&locationID)
	if err != nil {
		return 0, 0, 0, fmt.Errorf("default location: %w", err)
	}
	return taxTypeID, currencyID, locationID, nil
}

func derefInt64(v *int64) int64 {
	if v == nil {
		return 0
	}
	return *v
}
