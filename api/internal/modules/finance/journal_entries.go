package finance

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/approval"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/processpolicy"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type JournalEntry struct {
	ID                int64   `json:"id"`
	EntryNo           string  `json:"entry_no"`
	Status            string  `json:"status"`
	Remarks           string  `json:"remarks,omitempty"`
	ArchivedAt        *string `json:"archived_at,omitempty"`
	ReversedAt        *string `json:"reversed_at,omitempty"`
	ReversalOfEntryID *int64  `json:"reversal_of_entry_id,omitempty"`
	ReversedByEntryID *int64  `json:"reversed_by_entry_id,omitempty"`
}

type JournalEntryLine struct {
	LineNo      int     `json:"line_no"`
	AccountCode string  `json:"account_code"`
	AccountName string  `json:"account_name,omitempty"`
	Debit       float64 `json:"debit"`
	Credit      float64 `json:"credit"`
	DeptID      *int64  `json:"dept_id,omitempty"`
	ProjectID   *int64  `json:"project_id,omitempty"`
	Remarks     string  `json:"remarks,omitempty"`
}

type JournalEntryDetail struct {
	JournalEntry
	Lines []JournalEntryLine `json:"lines"`
}

type journalLineInput struct {
	AccountCode string  `json:"account_code"`
	Debit       float64 `json:"debit"`
	Credit      float64 `json:"credit"`
	DeptID      *int64  `json:"dept_id,omitempty"`
	ProjectID   *int64  `json:"project_id,omitempty"`
}

func registerJournalEntryRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("finance.journal_entries", auth.AccessRead)).Get("/journal-entries", listJournalEntries(pool))
	r.With(auth.RequirePermission("finance.journal_entries", auth.AccessRead)).Get("/journal-entries/{id}", getJournalEntry(pool))
	r.With(auth.RequirePermission("finance.journal_entries_new", auth.AccessWrite)).Post("/journal-entries", createJournalEntry(pool))
	r.With(auth.RequirePermission("finance.journal_entries_new", auth.AccessWrite)).Put("/journal-entries/{id}", updateJournalEntry(pool))
	r.With(auth.RequireSubmit("finance.journal_entries_post")).Post("/journal-entries/{id}/post", postJournalEntry(pool))
	r.With(auth.RequireSubmit("finance.journal_entries_post")).Post("/journal-entries/{id}/reverse", reverseJournalEntry(pool))
	r.With(auth.RequirePermission("finance.journal_entries_new", auth.AccessWrite)).Post("/journal-entries/{id}/archive", archiveJournalEntry(pool))
	r.With(auth.RequirePermission("finance.journal_entries_new", auth.AccessWrite)).Post("/journal-entries/{id}/unarchive", unarchiveJournalEntry(pool))
}

func listJournalEntries(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"entry_no":   "entry_no",
		"entry_date": "entry_date",
		"created_at": "created_at",
		"updated_at": "updated_at",
		"id":         "id",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParamsWithDefaults(r, "updated_at", "desc", allowed)
		offset := httputil.Offset(p)
		statusFilter := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("status")))
		includeArchived := strings.TrimSpace(r.URL.Query().Get("include_archived")) == "1" ||
			strings.EqualFold(strings.TrimSpace(r.URL.Query().Get("include_archived")), "true") ||
			statusFilter == "archived"
		args := []any{tu.TenantID}
		where := "tenant_id = $1"
		if statusFilter == "archived" {
			where += " and (archived_at is not null or status = 'cancelled')"
		} else {
			if !includeArchived {
				where += " and archived_at is null"
			}
			if statusFilter == "draft" || statusFilter == "posted" || statusFilter == "cancelled" {
				args = append(args, statusFilter)
				where += fmt.Sprintf(" and status = $%d", len(args))
			} else if !includeArchived {
				where += " and status <> 'cancelled'"
			}
		}
		if p.Q != "" {
			args = append(args, "%"+p.Q+"%")
			where += fmt.Sprintf(" and (entry_no ilike $%d or coalesce(remarks, '') ilike $%d)", len(args), len(args))
		}
		args = append(args, p.PageSize, offset)
		limIdx, offIdx := len(args)-1, len(args)
		q := fmt.Sprintf(`
			select id, entry_no, status, coalesce(remarks, ''),
			  archived_at::text, reversed_at::text, reversal_of_entry_id, reversed_by_entry_id,
			  count(*) over()
			from public.fin_journal_entries where %s
			order by %s %s, id %s limit $%d offset $%d`, where, p.Sort, orderSQL(p.Order), orderSQL(p.Order), limIdx, offIdx)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list journal entries.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []JournalEntry
		var total int64
		for rows.Next() {
			var je JournalEntry
			if err := rows.Scan(
				&je.ID, &je.EntryNo, &je.Status, &je.Remarks,
				&je.ArchivedAt, &je.ReversedAt, &je.ReversalOfEntryID, &je.ReversedByEntryID,
				&total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read entries.", "ERR_INTERNAL")
				return
			}
			out = append(out, je)
		}
		if out == nil {
			out = []JournalEntry{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func getJournalEntry(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		detail, err := loadJournalEntryDetail(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Journal entry not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, detail, "")
	}
}

func loadJournalEntryDetail(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (*JournalEntryDetail, error) {
	var detail JournalEntryDetail
	err := pool.QueryRow(ctx, `
		select id, entry_no, status, coalesce(remarks, ''),
		  archived_at::text, reversed_at::text, reversal_of_entry_id, reversed_by_entry_id
		from public.fin_journal_entries
		where id = $1 and tenant_id = $2`, id, tenantID).Scan(
		&detail.ID, &detail.EntryNo, &detail.Status, &detail.Remarks,
		&detail.ArchivedAt, &detail.ReversedAt, &detail.ReversalOfEntryID, &detail.ReversedByEntryID,
	)
	if err != nil {
		return nil, err
	}
	rows, err := pool.Query(ctx, `
		select jel.line_no, a.account_code, coalesce(a.account_name, ''),
		  jel.debit::float8, jel.credit::float8, jel.dept_id, jel.project_id, coalesce(jel.remarks, '')
		from public.fin_journal_entry_lines jel
		join public.fin_accounts a on a.id = jel.account_id
		where jel.journal_entry_id = $1
		order by jel.line_no`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	detail.Lines = []JournalEntryLine{}
	for rows.Next() {
		var ln JournalEntryLine
		if err := rows.Scan(&ln.LineNo, &ln.AccountCode, &ln.AccountName, &ln.Debit, &ln.Credit, &ln.DeptID, &ln.ProjectID, &ln.Remarks); err != nil {
			return nil, err
		}
		detail.Lines = append(detail.Lines, ln)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return &detail, nil
}

func createJournalEntry(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body struct {
			Remarks string             `json:"remarks"`
			Lines   []journalLineInput `json:"lines"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.Lines) < 2 {
			response.Validation(w, map[string]string{"lines": "At least two lines required."})
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create entry.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		var dateSeq int
		_ = tx.QueryRow(r.Context(), `select coalesce(max(date_seq),0)+1 from public.fin_journal_entries where tenant_id=$1 and entry_date=current_date`, tu.TenantID).Scan(&dateSeq)
		entryNo := "JE-" + strconv.Itoa(dateSeq)
		var id int64
		if err := tx.QueryRow(r.Context(), `
			insert into public.fin_journal_entries (tenant_id, entry_date, date_seq, entry_no, status, remarks, created_by_user_id)
			values ($1, current_date, $2, $3, 'draft', $4, $5) returning id`,
			tu.TenantID, dateSeq, entryNo, body.Remarks, tu.AppUserID).Scan(&id); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to insert entry.", "ERR_INTERNAL")
			return
		}
		for i, ln := range body.Lines {
			var accountID int64
			if err := tx.QueryRow(r.Context(), `select id from public.fin_accounts where tenant_id=$1 and account_code=$2`, tu.TenantID, ln.AccountCode).Scan(&accountID); err != nil {
				response.Validation(w, map[string]string{"lines": "Invalid account code."})
				return
			}
			_, err = tx.Exec(r.Context(), `
				insert into public.fin_journal_entry_lines (journal_entry_id, line_no, account_id, debit, credit, dept_id, project_id)
				values ($1,$2,$3,$4,$5,$6,$7)`, id, i+1, accountID, ln.Debit, ln.Credit, ln.DeptID, ln.ProjectID)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to insert line.", "ERR_INTERNAL")
				return
			}
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.journal_entry.create", "fin_journal_entry", &id, nil, body)
		response.OK(w, JournalEntry{ID: id, EntryNo: entryNo, Status: "draft", Remarks: body.Remarks}, "Created.")
	}
}

func updateJournalEntry(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body struct {
			Remarks string             `json:"remarks"`
			Lines   []journalLineInput `json:"lines"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.Lines) < 2 {
			response.Validation(w, map[string]string{"lines": "At least two lines required."})
			return
		}
		before, _ := loadJournalEntryDetail(r.Context(), pool, tu.TenantID, id)
		var status string
		var archivedAt *time.Time
		err = pool.QueryRow(r.Context(), `
			select status, archived_at from public.fin_journal_entries
			where id = $1 and tenant_id = $2`, id, tu.TenantID).Scan(&status, &archivedAt)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Journal entry not found.", "ERR_NOT_FOUND")
			return
		}
		if status != "draft" {
			response.Validation(w, map[string]string{"status": "Only draft journal entries can be edited."})
			return
		}
		if archivedAt != nil {
			response.Validation(w, map[string]string{"archived_at": "Unarchive the entry before editing."})
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update entry.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		if _, err := tx.Exec(r.Context(), `
			update public.fin_journal_entries set remarks = $2, updated_at = now()
			where id = $1 and tenant_id = $3 and status = 'draft'`, id, body.Remarks, tu.TenantID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update entry.", "ERR_INTERNAL")
			return
		}
		if _, err := tx.Exec(r.Context(), `delete from public.fin_journal_entry_lines where journal_entry_id = $1`, id); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to replace lines.", "ERR_INTERNAL")
			return
		}
		for i, ln := range body.Lines {
			var accountID int64
			if err := tx.QueryRow(r.Context(), `select id from public.fin_accounts where tenant_id=$1 and account_code=$2`, tu.TenantID, ln.AccountCode).Scan(&accountID); err != nil {
				response.Validation(w, map[string]string{"lines": "Invalid account code."})
				return
			}
			if _, err = tx.Exec(r.Context(), `
				insert into public.fin_journal_entry_lines (journal_entry_id, line_no, account_id, debit, credit, dept_id, project_id)
				values ($1,$2,$3,$4,$5,$6,$7)`, id, i+1, accountID, ln.Debit, ln.Credit, ln.DeptID, ln.ProjectID); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to insert line.", "ERR_INTERNAL")
				return
			}
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}
		after, _ := loadJournalEntryDetail(r.Context(), pool, tu.TenantID, id)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.journal_entry.update", "fin_journal_entry", &id, before, after)
		response.OK(w, after, "Updated.")
	}
}

func postJournalEntry(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		var debit, credit float64
		err := pool.QueryRow(r.Context(), `
			select coalesce(sum(debit),0), coalesce(sum(credit),0)
			from public.fin_journal_entry_lines jel
			join public.fin_journal_entries je on je.id = jel.journal_entry_id
			where je.id = $1 and je.tenant_id = $2 and je.status = 'draft' and je.archived_at is null`, id, tu.TenantID).Scan(&debit, &credit)
		if err != nil || debit != credit {
			response.ValidationSmart(w, map[string]string{"lines": "Journal entry must balance before posting."})
			return
		}
		var entryDate time.Time
		if err := pool.QueryRow(r.Context(), `
			select entry_date from public.fin_journal_entries
			where id = $1 and tenant_id = $2 and status = 'draft' and archived_at is null`, id, tu.TenantID).Scan(&entryDate); err != nil {
			response.Err(w, http.StatusNotFound, "Journal entry not found.", "ERR_NOT_FOUND")
			return
		}
		if errs := validatePostingDate(r.Context(), pool, tu.TenantID, entryDate); len(errs) > 0 {
			response.ValidationSmart(w, errs)
			return
		}
		policy, err := processpolicy.Load(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load process policies.", "ERR_INTERNAL")
			return
		}
		if policy.FinanceRequireJEApproval {
			status, found, err := approval.Status(r.Context(), pool, tu.TenantID, "journal_entry", id)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to check approval.", "ERR_INTERNAL")
				return
			}
			if v := processpolicy.ValidateJournalEntryPost(policy, found, status); v != nil {
				response.Validation(w, v)
				return
			}
		}
		tag, err := pool.Exec(r.Context(), `
			update public.fin_journal_entries set status='posted', posted_at=now(), updated_at=now()
			where id=$1 and tenant_id=$2 and status='draft' and archived_at is null`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Journal entry not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.journal_entry.post", "fin_journal_entry", &id, "draft", "posted")
		response.OK(w, map[string]any{"id": id, "status": "posted"}, "Posted.")
	}
}

func reverseJournalEntry(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		src, err := loadJournalEntryDetail(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Journal entry not found.", "ERR_NOT_FOUND")
			return
		}
		if src.Status != "posted" {
			response.Validation(w, map[string]string{"status": "Only posted journal entries can be reversed."})
			return
		}
		if src.ReversedByEntryID != nil {
			response.Validation(w, map[string]string{"reversed_by_entry_id": "This entry was already reversed."})
			return
		}
		if src.ArchivedAt != nil {
			response.Validation(w, map[string]string{"archived_at": "Unarchive before reversing."})
			return
		}
		if len(src.Lines) == 0 {
			response.Validation(w, map[string]string{"lines": "Journal entry has no lines to reverse."})
			return
		}
		// The reversing entry is dated today, so today's period must be open.
		if errs := validatePostingDate(r.Context(), pool, tu.TenantID, time.Now().UTC().Truncate(24*time.Hour)); len(errs) > 0 {
			response.ValidationSmart(w, errs)
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to reverse entry.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var dateSeq int
		_ = tx.QueryRow(r.Context(), `select coalesce(max(date_seq),0)+1 from public.fin_journal_entries where tenant_id=$1 and entry_date=current_date`, tu.TenantID).Scan(&dateSeq)
		entryNo := "JE-" + strconv.Itoa(dateSeq)
		remarks := strings.TrimSpace("Reversal of " + src.EntryNo)
		if src.Remarks != "" {
			remarks += " — " + src.Remarks
		}
		var revID int64
		if err := tx.QueryRow(r.Context(), `
			insert into public.fin_journal_entries (
			  tenant_id, entry_date, date_seq, entry_no, status, remarks, created_by_user_id,
			  reversal_of_entry_id, posted_at
			) values ($1, current_date, $2, $3, 'posted', $4, $5, $6, now())
			returning id`,
			tu.TenantID, dateSeq, entryNo, remarks, tu.AppUserID, id).Scan(&revID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create reversing entry.", "ERR_INTERNAL")
			return
		}
		for i, ln := range src.Lines {
			var accountID int64
			if err := tx.QueryRow(r.Context(), `select id from public.fin_accounts where tenant_id=$1 and account_code=$2`, tu.TenantID, ln.AccountCode).Scan(&accountID); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to resolve reversal accounts.", "ERR_INTERNAL")
				return
			}
			var lineRemarks any
			if strings.TrimSpace(ln.Remarks) != "" {
				lineRemarks = ln.Remarks
			}
			if _, err = tx.Exec(r.Context(), `
				insert into public.fin_journal_entry_lines (journal_entry_id, line_no, account_id, debit, credit, dept_id, project_id, remarks)
				values ($1,$2,$3,$4,$5,$6,$7,$8)`, revID, i+1, accountID, ln.Credit, ln.Debit, ln.DeptID, ln.ProjectID, lineRemarks); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to insert reversing lines.", "ERR_INTERNAL")
				return
			}
		}
		tag, err := tx.Exec(r.Context(), `
			update public.fin_journal_entries
			set reversed_at = now(), reversed_by_entry_id = $2, updated_at = now()
			where id = $1 and tenant_id = $3 and status = 'posted' and reversed_by_entry_id is null`, id, revID, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to mark original as reversed.", "ERR_INTERNAL")
			return
		}
		if tag.RowsAffected() == 0 {
			response.Validation(w, map[string]string{"reversed_by_entry_id": "This entry was already reversed."})
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save reversal.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.journal_entry.reverse", "fin_journal_entry", &id,
			map[string]any{"status": "posted"}, map[string]any{"reversed_by_entry_id": revID, "reversal_entry_no": entryNo})
		response.OK(w, map[string]any{"id": id, "reversal_entry_id": revID, "reversal_entry_no": entryNo}, "Reversed.")
	}
}

func archiveJournalEntry(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var status string
		var reversedBy *int64
		if err := pool.QueryRow(r.Context(), `
			select status, reversed_by_entry_id from public.fin_journal_entries
			where id = $1 and tenant_id = $2 and archived_at is null`, id, tu.TenantID).Scan(&status, &reversedBy); err != nil {
			response.Err(w, http.StatusNotFound, "Journal entry not found or already archived.", "ERR_NOT_FOUND")
			return
		}
		// Archiving only hides the entry; a posted entry still sits in the ledger,
		// so it has to be reversed before it can leave the default list.
		if status == "posted" && reversedBy == nil {
			response.Validation(w, map[string]string{"status": "Reverse this posted entry before archiving it."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.fin_journal_entries
			set archived_at = now(), updated_at = now()
			where id = $1 and tenant_id = $2 and archived_at is null`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Journal entry not found or already archived.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.journal_entry.archive", "fin_journal_entry", &id, map[string]any{"status": status}, map[string]any{"archived": true})
		response.OK(w, map[string]any{"id": id, "archived": true}, "Archived.")
	}
}

func unarchiveJournalEntry(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.fin_journal_entries
			set archived_at = null, updated_at = now()
			where id = $1 and tenant_id = $2 and archived_at is not null`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Journal entry not found or not archived.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.journal_entry.unarchive", "fin_journal_entry", &id, nil, map[string]any{"archived": false})
		response.OK(w, map[string]any{"id": id, "archived": false}, "Unarchived.")
	}
}
