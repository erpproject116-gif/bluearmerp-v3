package finance

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/approval"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/processpolicy"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type JournalEntry struct {
	ID      int64  `json:"id"`
	EntryNo string `json:"entry_no"`
	Status  string `json:"status"`
	Remarks string `json:"remarks,omitempty"`
}

func registerJournalEntryRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("finance.journal_entries", auth.AccessRead)).Get("/journal-entries", listJournalEntries(pool))
	r.With(auth.RequirePermission("finance.journal_entries_new", auth.AccessWrite)).Post("/journal-entries", createJournalEntry(pool))
	r.With(auth.RequireSubmit("finance.journal_entries_post")).Post("/journal-entries/{id}/post", postJournalEntry(pool))
}

func listJournalEntries(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "entry_date", map[string]string{"entry_no": "entry_no"})
		offset := httputil.Offset(p)
		rows, err := pool.Query(r.Context(), `
			select id, entry_no, status, coalesce(remarks, ''), count(*) over()
			from public.fin_journal_entries where tenant_id = $1
			order by entry_date desc, id desc limit $2 offset $3`, tu.TenantID, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list journal entries.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []JournalEntry
		var total int64
		for rows.Next() {
			var je JournalEntry
			if err := rows.Scan(&je.ID, &je.EntryNo, &je.Status, &je.Remarks, &total); err != nil {
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

func createJournalEntry(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body struct {
			Remarks string `json:"remarks"`
			Lines   []struct {
				AccountCode string  `json:"account_code"`
				Debit       float64 `json:"debit"`
				Credit      float64 `json:"credit"`
			} `json:"lines"`
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
				insert into public.fin_journal_entry_lines (journal_entry_id, line_no, account_id, debit, credit)
				values ($1,$2,$3,$4,$5)`, id, i+1, accountID, ln.Debit, ln.Credit)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to insert line.", "ERR_INTERNAL")
				return
			}
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}
		response.OK(w, JournalEntry{ID: id, EntryNo: entryNo, Status: "draft", Remarks: body.Remarks}, "Created.")
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
			where je.id = $1 and je.tenant_id = $2 and je.status = 'draft'`, id, tu.TenantID).Scan(&debit, &credit)
		if err != nil || debit != credit {
			response.Validation(w, map[string]string{"lines": "Journal entry must balance before posting."})
			return
		}
		var entryDate time.Time
		if err := pool.QueryRow(r.Context(), `
			select entry_date from public.fin_journal_entries
			where id = $1 and tenant_id = $2 and status = 'draft'`, id, tu.TenantID).Scan(&entryDate); err != nil {
			response.Err(w, http.StatusNotFound, "Journal entry not found.", "ERR_NOT_FOUND")
			return
		}
		if errs := validatePostingDate(r.Context(), pool, tu.TenantID, entryDate); len(errs) > 0 {
			response.Validation(w, errs)
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
			where id=$1 and tenant_id=$2 and status='draft'`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Journal entry not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"id": id, "status": "posted"}, "Posted.")
	}
}
