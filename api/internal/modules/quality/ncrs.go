package quality

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

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type Ncr struct {
	ID              int64   `json:"id"`
	NcrNo           string  `json:"ncr_no"`
	NcrDate         string  `json:"ncr_date"`
	Title           string  `json:"title"`
	Description     *string `json:"description,omitempty"`
	Severity        string  `json:"severity"`
	Status          string  `json:"status"`
	GoodsReceiptID  *int64  `json:"goods_receipt_id,omitempty"`
	ItemID          *int64  `json:"item_id,omitempty"`
	ItemName        string  `json:"item_name,omitempty"`
	CreatedByUserID *int64  `json:"created_by_user_id,omitempty"`
	ClosedAt        *string `json:"closed_at,omitempty"`
}

type ncrBody struct {
	Title          string  `json:"title"`
	Description    *string `json:"description"`
	Severity       string  `json:"severity"`
	GoodsReceiptID *int64  `json:"goods_receipt_id"`
	ItemID         *int64  `json:"item_id"`
}

type ncrPatchBody struct {
	Title       *string `json:"title"`
	Description *string `json:"description"`
	Severity    *string `json:"severity"`
	Status      *string `json:"status"`
}

type grInspectionBody struct {
	InspectionStatus string  `json:"inspection_status"`
	InspectionNotes  *string `json:"inspection_notes"`
}

func listNcrs(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"ncr_no": "n.ncr_no", "status": "n.status", "ncr_date": "n.ncr_date", "severity": "n.severity",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "ncr_date", allowed)
		if p.Order == "" {
			p.Order = "desc"
		}
		offset := httputil.Offset(p)
		where := "n.tenant_id = $1"
		args := []any{tu.TenantID}
		n := 2
		if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
			where += fmt.Sprintf(" and (n.ncr_no ilike $%d or n.title ilike $%d)", n, n)
			args = append(args, "%"+q+"%")
			n++
		}
		if st := strings.TrimSpace(r.URL.Query().Get("status")); st != "" {
			where += fmt.Sprintf(" and n.status = $%d", n)
			args = append(args, st)
			n++
		}
		sortCol := allowed[p.Sort]
		if sortCol == "" {
			sortCol = "n.ncr_date"
		}
		q := fmt.Sprintf(`
			select n.id, n.ncr_no, n.ncr_date::text, n.title, n.description,
			  n.severity, n.status, n.goods_receipt_id, n.item_id, coalesce(i.item_name, ''),
			  n.created_by_user_id, n.closed_at::text, count(*) over()
			from public.qms_ncrs n
			left join public.inv_items i on i.id = n.item_id
			where %s
			order by %s %s
			limit $%d offset $%d`, where, sortCol, orderSQL(p.Order), n, n+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list NCRs.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []Ncr
		var total int64
		for rows.Next() {
			var row Ncr
			var desc *string
			var closed *string
			if err := rows.Scan(
				&row.ID, &row.NcrNo, &row.NcrDate, &row.Title, &desc,
				&row.Severity, &row.Status, &row.GoodsReceiptID, &row.ItemID, &row.ItemName,
				&row.CreatedByUserID, &closed, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read NCR.", "ERR_INTERNAL")
				return
			}
			row.Description = desc
			row.ClosedAt = closed
			out = append(out, row)
		}
		if out == nil {
			out = []Ncr{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func getNcr(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		row, err := loadNcr(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "NCR not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, row, "OK")
	}
}

func createNcr(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body ncrBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateNcrBody(body); errs != nil {
			response.Validation(w, errs)
			return
		}
		ncrDate := time.Now()
		var seq int
		_ = pool.QueryRow(r.Context(), `
			select coalesce(max(substring(ncr_no from '[0-9]+$')::int), 0) + 1
			from public.qms_ncrs
			where tenant_id = $1 and ncr_date = $2::date`, tu.TenantID, ncrDate.Format("2006-01-02")).Scan(&seq)
		ncrNo := fmt.Sprintf("NCR-%s-%03d", ncrDate.Format("20060102"), seq)

		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.qms_ncrs (
			  tenant_id, ncr_no, ncr_date, title, description, severity,
			  goods_receipt_id, item_id, created_by_user_id
			) values ($1,$2,$3::date,$4,$5,$6,$7,$8,$9)
			returning id`,
			tu.TenantID, ncrNo, ncrDate.Format("2006-01-02"), strings.TrimSpace(body.Title), body.Description,
			normalizeSeverity(body.Severity), body.GoodsReceiptID, body.ItemID, tu.AppUserID,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create NCR.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "quality.ncr.create", "qms_ncr", &id, nil, body)
		row, _ := loadNcr(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "Created.")
	}
}

func patchNcr(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body ncrPatchBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		before, _ := loadNcr(r.Context(), pool, tu.TenantID, id)
		sets := []string{"updated_at = now()"}
		args := []any{id, tu.TenantID}
		n := 3
		if body.Title != nil {
			sets = append(sets, fmt.Sprintf("title = $%d", n))
			args = append(args, strings.TrimSpace(*body.Title))
			n++
		}
		if body.Description != nil {
			sets = append(sets, fmt.Sprintf("description = $%d", n))
			args = append(args, body.Description)
			n++
		}
		if body.Severity != nil {
			sets = append(sets, fmt.Sprintf("severity = $%d", n))
			args = append(args, normalizeSeverity(*body.Severity))
			n++
		}
		if body.Status != nil {
			st := strings.TrimSpace(*body.Status)
			sets = append(sets, fmt.Sprintf("status = $%d", n))
			args = append(args, st)
			n++
			if st == "closed" {
				sets = append(sets, "closed_at = now()")
			}
		}
		q := fmt.Sprintf(`update public.qms_ncrs set %s where id = $1 and tenant_id = $2`, strings.Join(sets, ", "))
		tag, err := pool.Exec(r.Context(), q, args...)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "NCR not found.", "ERR_NOT_FOUND")
			return
		}
		row, _ := loadNcr(r.Context(), pool, tu.TenantID, id)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "quality.ncr.update", "qms_ncr", &id, before, row)
		response.OK(w, row, "Updated.")
	}
}

func deleteNcr(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `delete from public.qms_ncrs where id = $1 and tenant_id = $2`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "NCR not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "quality.ncr.delete", "qms_ncr", &id, nil, nil)
		response.OK(w, nil, "Deleted.")
	}
}

func loadNcr(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (Ncr, error) {
	var row Ncr
	var desc *string
	var closed *string
	err := pool.QueryRow(ctx, `
		select n.id, n.ncr_no, n.ncr_date::text, n.title, n.description,
		  n.severity, n.status, n.goods_receipt_id, n.item_id, coalesce(i.item_name, ''),
		  n.created_by_user_id, n.closed_at::text
		from public.qms_ncrs n
		left join public.inv_items i on i.id = n.item_id
		where n.id = $1 and n.tenant_id = $2`, id, tenantID).Scan(
		&row.ID, &row.NcrNo, &row.NcrDate, &row.Title, &desc,
		&row.Severity, &row.Status, &row.GoodsReceiptID, &row.ItemID, &row.ItemName,
		&row.CreatedByUserID, &closed,
	)
	row.Description = desc
	row.ClosedAt = closed
	return row, err
}

func validateNcrBody(body ncrBody) map[string]string {
	errs := map[string]string{}
	if strings.TrimSpace(body.Title) == "" {
		errs["title"] = "Title is required."
	}
	if len(errs) > 0 {
		return errs
	}
	return nil
}

func normalizeSeverity(s string) string {
	s = strings.TrimSpace(strings.ToLower(s))
	switch s {
	case "major", "critical":
		return s
	default:
		return "minor"
	}
}
