package manufacturing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/financedefaults"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/invoicejournal"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// booksStatusSQL matches the register: a reversal wins, otherwise the journal
// status when it is posted or draft, otherwise the cost never reached the books.
const booksStatusSQL = `case
			when rev.id is not null then 'reversed'
			when je.status in ('posted', 'draft') then je.status
			else 'not_posted'
		end`

type productionCostRow struct {
	WorkOrderID            int64   `json:"work_order_id"`
	WorkOrderNo            string  `json:"work_order_no"`
	OrderDate              string  `json:"order_date"`
	BomType                string  `json:"bom_type"`
	MaterialCost           float64 `json:"material_cost"`
	LaborCost              float64 `json:"labor_cost"`
	OverheadCost           float64 `json:"overhead_cost"`
	OtherCost              float64 `json:"other_cost"`
	TotalCost              float64 `json:"total_cost"`
	JournalEntryID         *int64  `json:"journal_entry_id"`
	JournalStatus          *string `json:"journal_status"`
	ReversalJournalEntryID *int64  `json:"reversal_journal_entry_id"`
	BooksStatus            string  `json:"books_status"`
}

func parseBooksStatusFilter(raw string) string {
	switch strings.TrimSpace(strings.ToLower(raw)) {
	case "posted", "draft", "not_posted", "reversed":
		return strings.TrimSpace(strings.ToLower(raw))
	default:
		return ""
	}
}

func listProductionCosts(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		filters, errs := parseWoReportDateRange(r)
		if len(errs) > 0 {
			response.Validation(w, errs)
			return
		}
		p := httputil.ParseListParams(r, "order_date", map[string]string{
			"order_date": "wo.order_date",
		})
		offset := httputil.Offset(p)

		where := `p.tenant_id = $1
			and wo.order_date >= $2::date and wo.order_date <= $3::date
			and (p.total_cost > 0 or p.journal_entry_id is not null)`
		args := []any{tu.TenantID, filters.DateFrom.Format("2006-01-02"), filters.DateTo.Format("2006-01-02")}
		argN := 4
		if bt := parseBomTypeListFilter(r.URL.Query().Get("bom_type")); bt != "" {
			where += fmt.Sprintf(" and coalesce(b.bom_type, 'assembly') = $%d", argN)
			args = append(args, bt)
			argN++
		}
		if bs := parseBooksStatusFilter(r.URL.Query().Get("books_status")); bs != "" {
			where += fmt.Sprintf(" and (%s) = $%d", booksStatusSQL, argN)
			args = append(args, bs)
			argN++
		}

		q := fmt.Sprintf(`
			select wo.id, wo.work_order_no, wo.order_date::text, coalesce(b.bom_type, 'assembly'),
			  p.material_cost::float8, p.labor_cost::float8, p.overhead_cost::float8,
			  p.other_cost::float8, p.total_cost::float8,
			  p.journal_entry_id, je.status, rev.journal_entry_id,
			  %s,
			  count(*) over()
			from public.mfg_work_order_cost_postings p
			join public.mfg_work_orders wo on wo.id = p.work_order_id and wo.tenant_id = p.tenant_id
			join public.mfg_boms b on b.id = wo.bom_id
			left join public.fin_journal_entries je on je.id = p.journal_entry_id and je.tenant_id = p.tenant_id
			left join public.mfg_work_order_reversals rev on rev.tenant_id = p.tenant_id and rev.work_order_id = p.work_order_id
			where %s
			order by wo.order_date desc, wo.id desc
			limit $%d offset $%d`, booksStatusSQL, where, argN, argN+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list production costs.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		out := []productionCostRow{}
		var total int64
		for rows.Next() {
			var row productionCostRow
			if err := rows.Scan(
				&row.WorkOrderID, &row.WorkOrderNo, &row.OrderDate, &row.BomType,
				&row.MaterialCost, &row.LaborCost, &row.OverheadCost, &row.OtherCost, &row.TotalCost,
				&row.JournalEntryID, &row.JournalStatus, &row.ReversalJournalEntryID,
				&row.BooksStatus, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read production costs.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if err := rows.Err(); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list production costs.", "ERR_INTERNAL")
			return
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

// ---- Record in books (Production -> Costs) ----

// rowQuerier is satisfied by *pgxpool.Pool and pgx.Tx.
type rowQuerier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

type execQuerier interface {
	rowQuerier
	Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
}

const productionCostAccountCode = "5555"
const productionCostAccountName = "Production Cost"

// costPostingPayload is what the Record in books dialog reads and receives back.
// Account ids are the stored choice, or the mapped Inventory / COGS defaults when
// nothing has been chosen yet. Labels use the same "[code] name" shape as the
// account lookup so the dialog can prefill its pickers.
type costPostingPayload struct {
	WorkOrderID                  int64                      `json:"work_order_id"`
	WorkOrderNo                  string                     `json:"work_order_no"`
	OrderDate                    string                     `json:"order_date"`
	Costs                        manufacturingCosts         `json:"costs"`
	Lines                        []manufacturingJournalLine `json:"lines"`
	DebitAccountID               *int64                     `json:"debit_account_id"`
	DebitAccountLabel            string                     `json:"debit_account_label"`
	CreditMaterialAccountID      *int64                     `json:"credit_material_account_id"`
	CreditMaterialAccountLabel   string                     `json:"credit_material_account_label"`
	CreditConversionAccountID    *int64                     `json:"credit_conversion_account_id"`
	CreditConversionAccountLabel string                     `json:"credit_conversion_account_label"`
	Remark                       string                     `json:"remark"`
	JournalEntryID               *int64                     `json:"journal_entry_id"`
	JournalStatus                *string                    `json:"journal_status"`
	ReversalJournalEntryID       *int64                     `json:"reversal_journal_entry_id"`
	BooksStatus                  string                     `json:"books_status"`
	reversed                     bool
}

type costPostingBody struct {
	DebitAccountID            int64  `json:"debit_account_id"`
	CreditMaterialAccountID   int64  `json:"credit_material_account_id"`
	CreditConversionAccountID *int64 `json:"credit_conversion_account_id"`
	Remark                    string `json:"remark"`
}

func (p costPostingPayload) conversionAmount() float64 {
	return p.Costs.Labor + p.Costs.Overhead + p.Costs.Other
}

// loadCostPosting reads the posting row for a job. An unset expense account
// opens on 5555 Production Cost.
func loadCostPosting(ctx context.Context, q execQuerier, tenantID, workOrderID int64) (costPostingPayload, error) {
	var p costPostingPayload
	err := q.QueryRow(ctx, fmt.Sprintf(`
		select wo.id, wo.work_order_no, wo.order_date::text,
		  p.material_cost::float8, p.labor_cost::float8, p.overhead_cost::float8,
		  p.other_cost::float8, p.total_cost::float8,
		  p.journal_entry_id, je.status, rev.journal_entry_id, rev.id is not null,
		  %s,
		  p.debit_account_id, p.credit_material_account_id, p.credit_conversion_account_id,
		  coalesce(p.remark, '')
		from public.mfg_work_order_cost_postings p
		join public.mfg_work_orders wo on wo.id = p.work_order_id and wo.tenant_id = p.tenant_id
		left join public.fin_journal_entries je on je.id = p.journal_entry_id and je.tenant_id = p.tenant_id
		left join public.mfg_work_order_reversals rev on rev.tenant_id = p.tenant_id and rev.work_order_id = p.work_order_id
		where p.tenant_id = $1 and p.work_order_id = $2`, booksStatusSQL),
		tenantID, workOrderID).Scan(
		&p.WorkOrderID, &p.WorkOrderNo, &p.OrderDate,
		&p.Costs.Material, &p.Costs.Labor, &p.Costs.Overhead, &p.Costs.Other, &p.Costs.Total,
		&p.JournalEntryID, &p.JournalStatus, &p.ReversalJournalEntryID, &p.reversed,
		&p.BooksStatus,
		&p.DebitAccountID, &p.CreditMaterialAccountID, &p.CreditConversionAccountID,
		&p.Remark,
	)
	if err != nil {
		return p, err
	}
	p.Lines = manufacturingJournalPreview(p.Costs)

	productionCostID, err := ensureProductionCostAccount(ctx, q, tenantID)
	if err != nil {
		return p, err
	}
	if p.conversionAmount() > 0.0001 && p.DebitAccountID == nil {
		p.DebitAccountID = productionCostID
	}
	p.DebitAccountLabel = accountLabel(ctx, q, tenantID, p.DebitAccountID)
	p.CreditMaterialAccountLabel = accountLabel(ctx, q, tenantID, p.CreditMaterialAccountID)
	p.CreditConversionAccountLabel = accountLabel(ctx, q, tenantID, p.CreditConversionAccountID)
	return p, nil
}

// ensureProductionCostAccount returns expense account 5555, creating it when missing.
func ensureProductionCostAccount(ctx context.Context, q execQuerier, tenantID int64) (*int64, error) {
	id, ok, err := productionCostAccountID(ctx, q, tenantID)
	if err != nil || ok {
		if !ok {
			return nil, err
		}
		return &id, nil
	}
	if _, err := q.Exec(ctx, `
		insert into public.fin_accounts (
		  tenant_id, account_code, account_name, account_type, is_group, is_system, is_active, sort_order, parent_id
		)
		select $1, $2, $3, 'expense', false, true, true, 5555, parent.id
		from (select 1) seed
		left join public.fin_accounts parent
		  on parent.tenant_id = $1 and parent.account_code = '5095' and parent.deleted_at is null
		where not exists (
		  select 1 from public.fin_accounts existing
		  where existing.tenant_id = $1 and existing.account_code = $2
		)`, tenantID, productionCostAccountCode, productionCostAccountName); err != nil {
		return nil, err
	}
	if _, err := q.Exec(ctx, `
		update public.fin_accounts
		set deleted_at = null, is_active = true, is_group = false, account_type = 'expense', account_name = $3
		where tenant_id = $1 and account_code = $2 and deleted_at is not null`,
		tenantID, productionCostAccountCode, productionCostAccountName); err != nil {
		return nil, err
	}
	id, ok, err = productionCostAccountID(ctx, q, tenantID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, nil
	}
	return &id, nil
}

func productionCostAccountID(ctx context.Context, q rowQuerier, tenantID int64) (int64, bool, error) {
	var id int64
	err := q.QueryRow(ctx, `
		select id from public.fin_accounts
		where tenant_id = $1 and account_code = $2 and deleted_at is null
		  and account_type = 'expense' and is_group = false and is_active = true`,
		tenantID, productionCostAccountCode).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, err
	}
	return id, true, nil
}

func accountLabel(ctx context.Context, q rowQuerier, tenantID int64, id *int64) string {
	if id == nil || *id <= 0 {
		return ""
	}
	var label string
	if err := q.QueryRow(ctx,
		`select '[' || account_code || '] ' || account_name from public.fin_accounts where id = $1 and tenant_id = $2`,
		*id, tenantID).Scan(&label); err != nil {
		return ""
	}
	return label
}

// validateCostAccount checks the account belongs to the tenant, is an active
// posting account (not a group header) and has the expected type.
func validateCostAccount(ctx context.Context, q rowQuerier, tenantID, id int64, wantType string) error {
	if id <= 0 {
		return errors.New("Choose an account.")
	}
	var accountType string
	var isGroup, isActive bool
	err := q.QueryRow(ctx, `
		select account_type, is_group, is_active
		from public.fin_accounts
		where id = $1 and tenant_id = $2 and deleted_at is null`, id, tenantID).
		Scan(&accountType, &isGroup, &isActive)
	if errors.Is(err, pgx.ErrNoRows) {
		return errors.New("Account not found.")
	}
	if err != nil {
		return err
	}
	if isGroup {
		return errors.New("Choose a posting account, not a group header.")
	}
	if !isActive {
		return errors.New("Account is inactive.")
	}
	if accountType != wantType {
		return fmt.Errorf("Choose an %s account.", wantType)
	}
	return nil
}

// resolveProductionCashAccount is the hidden cash side of Record in books.
// Crediting it reduces cash. The operator does not pick it on this screen.
func resolveProductionCashAccount(ctx context.Context, q rowQuerier, tenantID int64) (int64, error) {
	id, err := financedefaults.ResolveByRole(ctx, q, tenantID, financedefaults.RoleCash)
	if err != nil || id <= 0 {
		return 0, errors.New("Set the cash account in Finance defaults before recording this cost.")
	}
	if err := validateCostAccount(ctx, q, tenantID, id, "asset"); err != nil {
		return 0, errors.New("The cash account in Finance defaults must be an active asset account.")
	}
	return id, nil
}

// sameCostPostingAccounts is true when debit and credit would net to zero on one account.
func sameCostPostingAccounts(debit, credit int64) bool {
	return debit > 0 && credit > 0 && debit == credit
}

func getCostPosting(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		workOrderID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		payload, err := loadCostPosting(r.Context(), pool, tu.TenantID, workOrderID)
		if errors.Is(err, pgx.ErrNoRows) {
			response.Err(w, http.StatusNotFound, "No production costs recorded for this job.", "ERR_NOT_FOUND")
			return
		}
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load production costs.", "ERR_INTERNAL")
			return
		}
		response.OK(w, payload, "OK")
	}
}

// putCostPosting records (or re-syncs a draft of) the completion journal entry
// with the accounts the user chose. It is the manual counterpart of the
// completion-time posting and is not gated on inventory_gl_hybrid_enabled.
func putCostPosting(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		workOrderID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body costPostingBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		body.Remark = strings.TrimSpace(body.Remark)

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to record in the books.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		current, err := loadCostPosting(r.Context(), tx, tu.TenantID, workOrderID)
		if errors.Is(err, pgx.ErrNoRows) {
			response.Err(w, http.StatusNotFound, "No production costs recorded for this job.", "ERR_NOT_FOUND")
			return
		}
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load production costs.", "ERR_INTERNAL")
			return
		}
		if current.conversionAmount() <= 0.0001 {
			response.Validation(w, map[string]string{"cost": "This job has no production cost to record. Material cost stays on the job and is not booked again."})
			return
		}
		if current.reversed {
			response.Err(w, http.StatusConflict, "This job was reversed. Nothing more to record.", "ERR_CONFLICT")
			return
		}
		if current.JournalStatus != nil && *current.JournalStatus == "posted" {
			response.Err(w, http.StatusConflict, "Already posted. Reverse it in Finance first.", "ERR_CONFLICT")
			return
		}

		errs := map[string]string{}
		if err := validateCostAccount(r.Context(), tx, tu.TenantID, body.DebitAccountID, "expense"); err != nil {
			errs["debit_account_id"] = err.Error()
		}
		cashID, cashErr := resolveProductionCashAccount(r.Context(), tx, tu.TenantID)
		if cashErr != nil {
			errs["cash"] = cashErr.Error()
		}
		if len(errs) > 0 {
			response.Validation(w, errs)
			return
		}

		entryDate, err := parseDate(current.OrderDate)
		if err != nil {
			entryDate = time.Now().UTC().Truncate(24 * time.Hour)
		}
		var autoPost bool
		if err := tx.QueryRow(r.Context(),
			`select coalesce(accounts_auto_post_purchase, false) from public.tenant_process_policies where tenant_id = $1`,
			tu.TenantID).Scan(&autoPost); err != nil && !errors.Is(err, pgx.ErrNoRows) {
			response.Err(w, http.StatusInternalServerError, "Failed to read posting policy.", "ERR_INTERNAL")
			return
		}

		// Only a draft is refreshed in place; a cancelled or missing entry gets a fresh one.
		var existingJE *int64
		if current.JournalEntryID != nil && current.JournalStatus != nil && *current.JournalStatus == "draft" {
			existingJE = current.JournalEntryID
		}
		remarks := "Manufacturing completion " + current.WorkOrderNo
		if body.Remark != "" {
			remarks += " — " + body.Remark
		}
		journalID, err := invoicejournal.SyncTx(
			r.Context(), tx, tu.TenantID, tu.AppUserID, entryDate, remarks, existingJE,
			productionCostCashLines(current.conversionAmount(), body.DebitAccountID, cashID), autoPost,
		)
		if err != nil {
			response.Validation(w, map[string]string{"journal": err.Error()})
			return
		}

		if _, err := tx.Exec(r.Context(), `
			update public.mfg_work_order_cost_postings
			set journal_entry_id = $3,
			  debit_account_id = $4,
			  credit_material_account_id = null,
			  credit_conversion_account_id = $5,
			  remark = nullif($6, ''),
			  accounts_set_by_user_id = $7,
			  accounts_set_at = now()
			where tenant_id = $1 and work_order_id = $2`,
			tu.TenantID, workOrderID, journalID, body.DebitAccountID, cashID,
			body.Remark, tu.AppUserID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to record in the books.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to record in the books.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "manufacturing.work_order_cost_post", "mfg_work_order", &workOrderID, nil, body)

		payload, err := loadCostPosting(r.Context(), pool, tu.TenantID, workOrderID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Recorded, but failed to reload.", "ERR_INTERNAL")
			return
		}
		message := "Recorded in the books."
		if payload.JournalStatus != nil && *payload.JournalStatus == "draft" {
			message = "Saved as a draft journal entry. Post it under Finance."
		}
		response.OK(w, payload, message)
	}
}
