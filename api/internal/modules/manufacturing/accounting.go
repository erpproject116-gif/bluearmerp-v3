package manufacturing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/financedefaults"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/fiscalyear"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/inventorygl"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/invoicejournal"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type manufacturingCosts struct {
	Material float64 `json:"material_cost"`
	Labor    float64 `json:"labor_cost"`
	Overhead float64 `json:"overhead_cost"`
	Other    float64 `json:"other_cost"`
	Total    float64 `json:"total_cost"`
}

type manufacturingJournalLine struct {
	Label  string  `json:"label"`
	Debit  float64 `json:"debit"`
	Credit float64 `json:"credit"`
}

type manufacturingCostInput struct {
	Labor    float64 `json:"labor_cost"`
	Overhead float64 `json:"overhead_cost"`
	Other    float64 `json:"other_cost"`
}

func saveWorkOrderCostInput(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		workOrderID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body manufacturingCostInput
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if _, err := normalizeManufacturingCosts(0, body.Labor, body.Overhead, body.Other); err != nil {
			response.Validation(w, map[string]string{"cost": err.Error()})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			insert into public.mfg_work_order_cost_inputs
			  (tenant_id, work_order_id, labor_cost, overhead_cost, other_cost, updated_by_user_id)
			select $1, wo.id, $3, $4, $5, $6
			from public.mfg_work_orders wo
			where wo.id=$2 and wo.tenant_id=$1 and wo.status in ('draft','released')
			on conflict (tenant_id, work_order_id) do update set
			  labor_cost=excluded.labor_cost,
			  overhead_cost=excluded.overhead_cost,
			  other_cost=excluded.other_cost,
			  updated_by_user_id=excluded.updated_by_user_id,
			  updated_at=now()`,
			tu.TenantID, workOrderID, body.Labor, body.Overhead, body.Other, tu.AppUserID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save manufacturing costs.", "ERR_INTERNAL")
			return
		}
		if tag.RowsAffected() == 0 {
			response.Validation(w, map[string]string{"status": "Costs can only be saved before completion."})
			return
		}
		response.OK(w, body, "Manufacturing costs saved.")
	}
}

func previewWorkOrderJournal(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		workOrderID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		labor, err := previewCostParam(r, "labor_cost")
		if err != nil {
			response.Validation(w, map[string]string{"labor_cost": err.Error()})
			return
		}
		overhead, err := previewCostParam(r, "overhead_cost")
		if err != nil {
			response.Validation(w, map[string]string{"overhead_cost": err.Error()})
			return
		}
		other, err := previewCostParam(r, "other_cost")
		if err != nil {
			response.Validation(w, map[string]string{"other_cost": err.Error()})
			return
		}
		workOrder, err := loadWorkOrder(r.Context(), pool, tu.TenantID, workOrderID)
		if errors.Is(err, pgx.ErrNoRows) {
			response.Err(w, http.StatusNotFound, "Work order not found.", "ERR_NOT_FOUND")
			return
		}
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load work order.", "ERR_INTERNAL")
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to preview journal.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		bom, err := loadBom(r.Context(), tx, tu.TenantID, workOrder.BomID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "BOM not found.", "ERR_INTERNAL")
			return
		}
		actualInput := workOrder.QtyToProduce
		material, err := estimateManufacturingMaterialCost(
			r.Context(), tx, tu.TenantID, bom, workOrder.QtyToProduce, actualInput,
		)
		if err != nil {
			response.Validation(w, map[string]string{"cost": err.Error()})
			return
		}
		costs, err := normalizeManufacturingCosts(material, labor, overhead, other)
		if err != nil {
			response.Validation(w, map[string]string{"cost": err.Error()})
			return
		}
		enabled, err := inventorygl.Enabled(r.Context(), tx, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to check journal policy.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{
			"costs":              costs,
			"lines":              manufacturingJournalPreview(costs),
			"accounting_enabled": enabled,
		}, "OK")
	}
}

func previewCostParam(r *http.Request, key string) (float64, error) {
	raw := r.URL.Query().Get(key)
	if raw == "" {
		return 0, nil
	}
	value, err := strconv.ParseFloat(raw, 64)
	if err != nil || value < 0 || math.IsNaN(value) || math.IsInf(value, 0) {
		return 0, errors.New("use a non-negative amount")
	}
	return value, nil
}

func normalizeManufacturingCosts(material, labor, overhead, other float64) (manufacturingCosts, error) {
	values := []float64{material, labor, overhead, other}
	for _, value := range values {
		if math.IsNaN(value) || math.IsInf(value, 0) || value < 0 {
			return manufacturingCosts{}, errors.New("manufacturing costs must be finite and non-negative")
		}
	}
	return manufacturingCosts{
		Material: material,
		Labor:    labor,
		Overhead: overhead,
		Other:    other,
		Total:    material + labor + overhead + other,
	}, nil
}

// Journal line labels shared by the preview and the posted entry.
const (
	costLineFinishedGoods = "Finished goods inventory"
	costLineMaterials     = "Materials inventory"
	costLineConversion    = "Production cost absorption"
)

// costPostingAccounts are the three chart-of-accounts legs of a completion entry:
// Dr finished goods (total), Cr materials (material), Cr conversion (labor+overhead+other).
type costPostingAccounts struct {
	Debit            int64
	CreditMaterial   int64
	CreditConversion int64
}

// buildCostPostingLines maps the preview lines onto the chosen accounts. Zero
// lines are already dropped by manufacturingJournalPreview, so the conversion
// account is only consulted when there is a conversion amount.
func buildCostPostingLines(costs manufacturingCosts, accts costPostingAccounts) []invoicejournal.Line {
	preview := manufacturingJournalPreview(costs)
	lines := make([]invoicejournal.Line, 0, len(preview))
	for _, line := range preview {
		accountID := accts.Debit
		switch line.Label {
		case costLineMaterials:
			accountID = accts.CreditMaterial
		case costLineConversion:
			accountID = accts.CreditConversion
		}
		lines = append(lines, invoicejournal.Line{
			AccountID: accountID,
			Debit:     line.Debit,
			Credit:    line.Credit,
			Remark:    line.Label,
		})
	}
	return lines
}

func manufacturingJournalPreview(costs manufacturingCosts) []manufacturingJournalLine {
	if costs.Total <= 0.0001 {
		return []manufacturingJournalLine{}
	}
	lines := []manufacturingJournalLine{{
		Label: costLineFinishedGoods,
		Debit: costs.Total,
	}}
	if costs.Material > 0.0001 {
		lines = append(lines, manufacturingJournalLine{
			Label:  costLineMaterials,
			Credit: costs.Material,
		})
	}
	conversion := costs.Labor + costs.Overhead + costs.Other
	if conversion > 0.0001 {
		lines = append(lines, manufacturingJournalLine{
			Label:  costLineConversion,
			Credit: conversion,
		})
	}
	return lines
}

func estimateManufacturingMaterialCost(
	ctx context.Context,
	tx pgx.Tx,
	tenantID int64,
	bom Bom,
	qtyProduced, actualInputQty float64,
) (float64, error) {
	if normalizeBomType(bom.BomType) == "disassembly" {
		var purchasePrice float64
		var standardCostsJSON []byte
		if err := tx.QueryRow(ctx, `
			select coalesce(purchase_price, 0)::float8, coalesce(standard_costs::text, '{}')
			from public.inv_items
			where id=$1 and tenant_id=$2 and deleted_at is null`,
			bom.FinishedItemID, tenantID).Scan(&purchasePrice, &standardCostsJSON); err != nil {
			return 0, err
		}
		return resolveItemUnitCost(purchasePrice, standardCostsJSON) * actualInputQty, nil
	}
	var total float64
	for _, line := range bom.Lines {
		issueQty, _, err := StockIssueForLine(ctx, tx, tenantID, line, qtyProduced, bom.OutputQty, bom.YieldPct)
		if err != nil {
			return 0, err
		}
		total += issueQty * line.UnitCost
	}
	return total, nil
}

func postManufacturingCompletionJournal(
	ctx context.Context,
	tx pgx.Tx,
	tenantID, userID, workOrderID int64,
	entryDate time.Time,
	workOrderNo string,
	costs manufacturingCosts,
) (int64, error) {
	enabled, err := inventorygl.Enabled(ctx, tx, tenantID)
	if err != nil || !enabled || costs.Total <= 0.0001 {
		return 0, err
	}
	inventoryAccountID, err := financedefaults.ResolveByRole(ctx, tx, tenantID, financedefaults.RoleInventory)
	if err != nil {
		return 0, err
	}
	cogsAccountID, err := financedefaults.ResolveByRole(ctx, tx, tenantID, financedefaults.RoleCOGS)
	if err != nil {
		return 0, err
	}
	entryNo := fmt.Sprintf("mfg_work_order-%d", workOrderID)
	var existingID int64
	err = tx.QueryRow(ctx,
		`select id from public.fin_journal_entries where tenant_id=$1 and entry_no=$2`,
		tenantID, entryNo).Scan(&existingID)
	if err == nil {
		return existingID, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return 0, err
	}

	status, postedAt, err := manufacturingJournalStatus(ctx, tx, tenantID, entryDate)
	if err != nil {
		return 0, err
	}
	var dateSeq int
	if err := tx.QueryRow(ctx,
		`select coalesce(max(date_seq),0)+1 from public.fin_journal_entries where tenant_id=$1 and entry_date=$2`,
		tenantID, entryDate).Scan(&dateSeq); err != nil {
		return 0, err
	}
	var journalID int64
	if err := tx.QueryRow(ctx, `
		insert into public.fin_journal_entries
		  (tenant_id, entry_date, date_seq, entry_no, status, remarks, posted_at, created_by_user_id)
		values ($1,$2,$3,$4,$5,$6,$7,$8)
		returning id`,
		tenantID, entryDate, dateSeq, entryNo, status,
		"Manufacturing completion "+workOrderNo, postedAt, userID).Scan(&journalID); err != nil {
		return 0, err
	}
	lines := buildCostPostingLines(costs, costPostingAccounts{
		Debit:            inventoryAccountID,
		CreditMaterial:   inventoryAccountID,
		CreditConversion: cogsAccountID,
	})
	for i, line := range lines {
		if _, err := tx.Exec(ctx, `
			insert into public.fin_journal_entry_lines
			  (journal_entry_id, line_no, account_id, debit, credit, remarks)
			values ($1,$2,$3,$4,$5,$6)`,
			journalID, i+1, line.AccountID, line.Debit, line.Credit, line.Remark); err != nil {
			return 0, err
		}
	}
	return journalID, nil
}

func postManufacturingReversalJournal(
	ctx context.Context,
	tx pgx.Tx,
	tenantID, userID, workOrderID, reversalID int64,
	entryDate time.Time,
	workOrderNo string,
) (int64, error) {
	var originalJournalID int64
	err := tx.QueryRow(ctx, `
		select journal_entry_id
		from public.mfg_work_order_cost_postings
		where tenant_id=$1 and work_order_id=$2 and journal_entry_id is not null`,
		tenantID, workOrderID).Scan(&originalJournalID)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	status, postedAt, err := manufacturingJournalStatus(ctx, tx, tenantID, entryDate)
	if err != nil {
		return 0, err
	}
	var dateSeq int
	if err := tx.QueryRow(ctx,
		`select coalesce(max(date_seq),0)+1 from public.fin_journal_entries where tenant_id=$1 and entry_date=$2`,
		tenantID, entryDate).Scan(&dateSeq); err != nil {
		return 0, err
	}
	var journalID int64
	if err := tx.QueryRow(ctx, `
		insert into public.fin_journal_entries
		  (tenant_id, entry_date, date_seq, entry_no, status, remarks, posted_at, created_by_user_id)
		values ($1,$2,$3,$4,$5,$6,$7,$8)
		returning id`,
		tenantID, entryDate, dateSeq, fmt.Sprintf("mfg_work_order_reversal-%d", reversalID),
		status, "Manufacturing reversal "+workOrderNo, postedAt, userID).Scan(&journalID); err != nil {
		return 0, err
	}
	_, err = tx.Exec(ctx, `
		insert into public.fin_journal_entry_lines
		  (journal_entry_id, line_no, account_id, debit, credit, party_id, remarks)
		select $1, line_no, account_id, credit, debit, party_id, concat('Reversal: ', coalesce(remarks, ''))
		from public.fin_journal_entry_lines
		where journal_entry_id=$2
		order by line_no`, journalID, originalJournalID)
	return journalID, err
}

func manufacturingJournalStatus(ctx context.Context, tx pgx.Tx, tenantID int64, entryDate time.Time) (string, *time.Time, error) {
	var requireApproval bool
	err := tx.QueryRow(ctx,
		`select coalesce(finance_require_je_approval, false) from public.tenant_process_policies where tenant_id=$1`,
		tenantID).Scan(&requireApproval)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return "", nil, err
	}
	if requireApproval {
		return "draft", nil, nil
	}
	if err := fiscalyear.ErrIfClosed(ctx, tx, tenantID, entryDate); err != nil {
		return "", nil, err
	}
	now := time.Now().UTC()
	return "posted", &now, nil
}
