package datacenter

import (
	"encoding/json"
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

type IngestedDocument struct {
	ID                int64           `json:"id"`
	RuleID            *int64          `json:"rule_id,omitempty"`
	SourceChannel     string          `json:"source_channel"`
	RawPayload        json.RawMessage `json:"raw_payload"`
	ParsedFields      json.RawMessage `json:"parsed_fields"`
	MatchStatus       string          `json:"match_status"`
	MatchedEntityID   *int64          `json:"matched_entity_id,omitempty"`
	Status            string          `json:"status"`
	GeneratedTargetID *int64          `json:"generated_target_id,omitempty"`
	CreatedAt         string          `json:"created_at"`
}

type ingestBody struct {
	RuleID       *int64          `json:"rule_id"`
	RawPayload   json.RawMessage `json:"raw_payload"`
	ParsedFields json.RawMessage `json:"parsed_fields"`
}

func listIngestedDocuments(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "created_at", map[string]string{"created_at": "d.created_at"})
		if p.Order == "" {
			p.Order = "desc"
		}
		offset := httputil.Offset(p)
		where := "d.tenant_id = $1"
		args := []any{tu.TenantID}
		n := 2
		if st := strings.TrimSpace(r.URL.Query().Get("status")); st != "" {
			where += " and d.status = $" + strconv.Itoa(n)
			args = append(args, st)
			n++
		}
		q := `
			select d.id, d.rule_id, d.source_channel, d.raw_payload, d.parsed_fields,
			  d.match_status, d.matched_entity_id, d.status, d.generated_target_id, d.created_at,
			  count(*) over()
			from public.ingested_documents d
			where ` + where + `
			order by d.created_at ` + orderSQL(p.Order) + `
			limit $` + strconv.Itoa(n) + ` offset $` + strconv.Itoa(n+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list inbox.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []IngestedDocument
		var total int64
		for rows.Next() {
			var row IngestedDocument
			var createdAt time.Time
			if err := rows.Scan(
				&row.ID, &row.RuleID, &row.SourceChannel, &row.RawPayload, &row.ParsedFields,
				&row.MatchStatus, &row.MatchedEntityID, &row.Status, &row.GeneratedTargetID, &createdAt, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read inbox.", "ERR_INTERNAL")
				return
			}
			row.CreatedAt = createdAt.Format(time.RFC3339)
			out = append(out, row)
		}
		if out == nil {
			out = []IngestedDocument{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func ingestWebhook(pool *pgxpool.Pool) http.HandlerFunc {
	return ingestDocument(pool, "webhook")
}

func ingestEmail(pool *pgxpool.Pool) http.HandlerFunc {
	return ingestDocument(pool, "email")
}

func ingestDocument(pool *pgxpool.Pool, channel string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body ingestBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		raw := body.RawPayload
		if raw == nil {
			raw = json.RawMessage("{}")
		}
		parsed := body.ParsedFields
		if parsed == nil {
			parsed = json.RawMessage("{}")
		}
		var id int64
		var createdAt time.Time
		err := pool.QueryRow(r.Context(), `
			insert into public.ingested_documents (tenant_id, rule_id, source_channel, raw_payload, parsed_fields)
			values ($1, $2, $3, $4, $5)
			returning id, created_at`,
			tu.TenantID, body.RuleID, channel, raw, parsed,
		).Scan(&id, &createdAt)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to ingest document.", "ERR_INTERNAL")
			return
		}
		doc := IngestedDocument{
			ID: id, RuleID: body.RuleID, SourceChannel: channel,
			RawPayload: raw, ParsedFields: parsed,
			MatchStatus: "pending", Status: "pending",
			CreatedAt: createdAt.Format(time.RFC3339),
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "data_center.ingest", "ingested_document", &id, nil, body)
		response.OK(w, doc, "Ingested.")
	}
}

type generateBody struct {
	TargetEntity string `json:"target_entity"`
}

func generateFromIngested(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body generateBody
		_ = json.NewDecoder(r.Body).Decode(&body)
		var status string
		err = pool.QueryRow(r.Context(), `
			select status from public.ingested_documents
			where id = $1 and tenant_id = $2`, id, tu.TenantID).Scan(&status)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Document not found.", "ERR_NOT_FOUND")
			return
		}
		if status == "generated" {
			response.Validation(w, map[string]string{"status": "Document already generated."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.ingested_documents set
			  status = 'generated', match_status = 'matched', updated_at = now()
			where id = $1 and tenant_id = $2`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Document not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "data_center.generate", "ingested_document", &id, nil, body)
		response.OK(w, map[string]any{"id": id, "status": "generated", "target_entity": body.TargetEntity}, "Generated.")
	}
}

func orderSQL(order string) string {
	if order == "desc" {
		return "desc"
	}
	return "asc"
}
