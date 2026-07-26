package sop

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

const maxSOPBodyBytes = 200 * 1024
const staleReviewDays = 180

type Document struct {
	ID          int64   `json:"id"`
	Title       string  `json:"title"`
	Category    string  `json:"category"`
	Status      string  `json:"status"`
	OwnerUserID *int64  `json:"owner_user_id,omitempty"`
	OwnerName   string  `json:"owner_name,omitempty"`
	Body        string  `json:"body,omitempty"`
	Version     int     `json:"version"`
	ReviewedAt  *string `json:"reviewed_at,omitempty"`
	PublishedAt *string `json:"published_at,omitempty"`
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`
	Stale       bool    `json:"stale,omitempty"`
}

type documentBody struct {
	Title       string  `json:"title"`
	Category    string  `json:"category"`
	OwnerUserID *int64  `json:"owner_user_id"`
	Body        string  `json:"body"`
	ReviewedAt  *string `json:"reviewed_at"`
}

type documentPatch struct {
	Title       *string `json:"title"`
	Category    *string `json:"category"`
	OwnerUserID *int64  `json:"owner_user_id"`
	Body        *string `json:"body"`
	Status      *string `json:"status"`
	ReviewedAt  *string `json:"reviewed_at"`
}

type namedCount struct {
	Key   string `json:"key"`
	Count int64  `json:"count"`
}

type dashboardOut struct {
	ByStatus   []namedCount `json:"by_status"`
	ByCategory []namedCount `json:"by_category"`
	StaleCount int64        `json:"stale_count"`
	StaleDays  int          `json:"stale_days"`
}

func listDocuments(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "title", map[string]string{
			"title": "d.title", "category": "d.category", "status": "d.status", "updated_at": "d.updated_at",
		})
		offset := httputil.Offset(p)
		where := "d.tenant_id = $1"
		args := []any{tu.TenantID}
		n := 2
		if st := strings.TrimSpace(r.URL.Query().Get("status")); st != "" {
			where += fmt.Sprintf(" and d.status = $%d", n)
			args = append(args, st)
			n++
		}
		if cat := strings.TrimSpace(r.URL.Query().Get("category")); cat != "" {
			where += fmt.Sprintf(" and d.category = $%d", n)
			args = append(args, cat)
			n++
		}
		if p.Q != "" {
			where += fmt.Sprintf(" and d.title ilike $%d", n)
			args = append(args, "%"+p.Q+"%")
			n++
		}
		q := fmt.Sprintf(`
			select d.id, d.title, d.category, d.status, d.owner_user_id, coalesce(u.full_name,''),
			  d.version, d.reviewed_at::text, d.published_at::text, d.created_at::text, d.updated_at::text,
			  (d.status = 'published' and d.reviewed_at is not null
			    and d.reviewed_at < (current_date - interval '%d days')::date) as stale,
			  count(*) over()
			from public.sop_documents d
			left join public.users u on u.id = d.owner_user_id
			where %s
			order by %s %s
			limit $%d offset $%d`, staleReviewDays, where, p.Sort, orderSQL(p.Order), n, n+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list documents.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []Document
		var total int64
		for rows.Next() {
			var row Document
			if err := rows.Scan(
				&row.ID, &row.Title, &row.Category, &row.Status, &row.OwnerUserID, &row.OwnerName,
				&row.Version, &row.ReviewedAt, &row.PublishedAt, &row.CreatedAt, &row.UpdatedAt,
				&row.Stale, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read documents.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []Document{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func getDocument(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		row, err := loadDocument(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Document not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, row, "OK")
	}
}

func createDocument(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body documentBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		title := strings.TrimSpace(body.Title)
		if title == "" {
			response.Validation(w, map[string]string{"title": "Required."})
			return
		}
		if len(body.Body) > maxSOPBodyBytes {
			response.Validation(w, map[string]string{"body": "Body too large (max 200KB)."})
			return
		}
		cat := strings.TrimSpace(body.Category)
		if cat == "" {
			cat = "general"
		}
		owner := body.OwnerUserID
		if owner == nil {
			id := tu.AppUserID
			owner = &id
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.sop_documents (
			  tenant_id, title, category, owner_user_id, body, reviewed_at
			) values ($1,$2,$3,$4,$5,$6::date)
			returning id`,
			tu.TenantID, title, cat, owner, body.Body, nullStr(body.ReviewedAt),
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create document.", "ERR_INTERNAL")
			return
		}
		row, _ := loadDocument(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "Created")
	}
}

func patchDocument(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		existing, err := loadDocument(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Document not found.", "ERR_NOT_FOUND")
			return
		}
		var body documentPatch
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		title, cat, owner, docBody, status, reviewed := existing.Title, existing.Category, existing.OwnerUserID, existing.Body, existing.Status, existing.ReviewedAt
		if body.Title != nil {
			title = strings.TrimSpace(*body.Title)
		}
		if body.Category != nil {
			cat = strings.TrimSpace(*body.Category)
		}
		if body.OwnerUserID != nil {
			owner = body.OwnerUserID
		}
		if body.Body != nil {
			if len(*body.Body) > maxSOPBodyBytes {
				response.Validation(w, map[string]string{"body": "Body too large (max 200KB)."})
				return
			}
			docBody = *body.Body
		}
		if body.Status != nil {
			switch *body.Status {
			case "draft", "published", "archived":
				status = *body.Status
			default:
				response.Validation(w, map[string]string{"status": "Invalid status."})
				return
			}
		}
		if body.ReviewedAt != nil {
			reviewed = body.ReviewedAt
		}
		if title == "" {
			response.Validation(w, map[string]string{"title": "Required."})
			return
		}
		_, err = pool.Exec(r.Context(), `
			update public.sop_documents set
			  title=$1, category=$2, owner_user_id=$3, body=$4, status=$5,
			  reviewed_at=$6::date, updated_at=now()
			where id=$7 and tenant_id=$8`,
			title, cat, owner, docBody, status, nullStr(reviewed), id, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update document.", "ERR_INTERNAL")
			return
		}
		row, _ := loadDocument(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "OK")
	}
}

func publishDocument(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to publish.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var body string
		var version int
		err = tx.QueryRow(r.Context(), `
			select body, version from public.sop_documents
			where id=$1 and tenant_id=$2 for update`, id, tu.TenantID).Scan(&body, &version)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Document not found.", "ERR_NOT_FOUND")
			return
		}
		newVersion := version + 1
		if _, err := tx.Exec(r.Context(), `
			insert into public.sop_document_versions (document_id, version, body, changed_by)
			values ($1, $2, $3, $4)`, id, newVersion, body, tu.AppUserID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to snapshot version.", "ERR_INTERNAL")
			return
		}
		if _, err := tx.Exec(r.Context(), `
			update public.sop_documents set
			  status='published', version=$1, published_at=now(),
			  reviewed_at=coalesce(reviewed_at, current_date), updated_at=now()
			where id=$2 and tenant_id=$3`, newVersion, id, tu.TenantID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to publish.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to publish.", "ERR_INTERNAL")
			return
		}
		row, _ := loadDocument(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "Published")
	}
}

func dashboardSummary(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		out := dashboardOut{ByStatus: []namedCount{}, ByCategory: []namedCount{}, StaleDays: staleReviewDays}
		rows, err := pool.Query(r.Context(), `
			select status, count(*)::bigint from public.sop_documents
			where tenant_id=$1 group by status order by status`, tu.TenantID)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var row namedCount
				if rows.Scan(&row.Key, &row.Count) == nil {
					out.ByStatus = append(out.ByStatus, row)
				}
			}
		}
		catRows, err := pool.Query(r.Context(), `
			select category, count(*)::bigint from public.sop_documents
			where tenant_id=$1 group by category order by category`, tu.TenantID)
		if err == nil {
			defer catRows.Close()
			for catRows.Next() {
				var row namedCount
				if catRows.Scan(&row.Key, &row.Count) == nil {
					out.ByCategory = append(out.ByCategory, row)
				}
			}
		}
		_ = pool.QueryRow(r.Context(), `
			select count(*)::bigint from public.sop_documents
			where tenant_id=$1 and status='published'
			  and reviewed_at is not null
			  and reviewed_at < (current_date - ($2::int || ' days')::interval)::date`,
			tu.TenantID, staleReviewDays).Scan(&out.StaleCount)
		w.Header().Set("Cache-Control", "private, max-age=30")
		response.OK(w, out, "OK")
	}
}

func loadDocument(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (Document, error) {
	var row Document
	err := pool.QueryRow(ctx, `
		select d.id, d.title, d.category, d.status, d.owner_user_id, coalesce(u.full_name,''),
		  d.body, d.version, d.reviewed_at::text, d.published_at::text, d.created_at::text, d.updated_at::text,
		  (d.status = 'published' and d.reviewed_at is not null
		    and d.reviewed_at < (current_date - interval '180 days')::date)
		from public.sop_documents d
		left join public.users u on u.id = d.owner_user_id
		where d.id=$1 and d.tenant_id=$2`, id, tenantID).Scan(
		&row.ID, &row.Title, &row.Category, &row.Status, &row.OwnerUserID, &row.OwnerName,
		&row.Body, &row.Version, &row.ReviewedAt, &row.PublishedAt, &row.CreatedAt, &row.UpdatedAt, &row.Stale,
	)
	return row, err
}

func orderSQL(order string) string {
	if order == "desc" {
		return "desc"
	}
	return "asc"
}

func nullStr(s *string) any {
	if s == nil || strings.TrimSpace(*s) == "" {
		return nil
	}
	return *s
}
