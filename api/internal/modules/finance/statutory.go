package finance

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/financedefaults"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type TaxpayerProfile struct {
	RDOCode          *string `json:"rdo_code,omitempty"`
	TaxRegime        *string `json:"tax_regime,omitempty"`
	RegistrationDate *string `json:"registration_date,omitempty"`
	LineOfBusiness   *string `json:"line_of_business,omitempty"`
	CORFileURL       *string `json:"cor_file_url,omitempty"`
	CASFileURL       *string `json:"cas_file_url,omitempty"`
	ATPFileURL       *string `json:"atp_file_url,omitempty"`
}

type taxpayerProfileBody struct {
	RDOCode          *string `json:"rdo_code"`
	TaxRegime        *string `json:"tax_regime"`
	RegistrationDate *string `json:"registration_date"`
	LineOfBusiness   *string `json:"line_of_business"`
	CORFileURL       *string `json:"cor_file_url"`
	CASFileURL       *string `json:"cas_file_url"`
	ATPFileURL       *string `json:"atp_file_url"`
}

type DocumentSeries struct {
	ID        int64   `json:"id"`
	DocType   string  `json:"doc_type"`
	Prefix    string  `json:"prefix"`
	StartNo   int64   `json:"start_no"`
	EndNo     int64   `json:"end_no"`
	NextNo    int64   `json:"next_no"`
	PermitRef *string `json:"permit_ref,omitempty"`
	CASRef    *string `json:"cas_ref,omitempty"`
	IsActive  bool    `json:"is_active"`
}

type documentSeriesBody struct {
	DocType   string  `json:"doc_type"`
	Prefix    string  `json:"prefix"`
	StartNo   *int64  `json:"start_no"`
	EndNo     int64   `json:"end_no"`
	NextNo    *int64  `json:"next_no"`
	PermitRef *string `json:"permit_ref"`
	CASRef    *string `json:"cas_ref"`
	IsActive  *bool   `json:"is_active"`
}

func registerStatutoryRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("finance.statutory_read", auth.AccessRead)).Get("/statutory/taxpayer-profile", getTaxpayerProfile(pool))
	r.With(auth.RequirePermission("finance.statutory_write", auth.AccessWrite)).Patch("/statutory/taxpayer-profile", patchTaxpayerProfile(pool))
	r.With(auth.RequirePermission("finance.statutory_read", auth.AccessRead)).Get("/statutory/attachments", getStatutoryAttachments(pool))
	r.With(auth.RequirePermission("finance.statutory_write", auth.AccessWrite)).Patch("/statutory/attachments", patchStatutoryAttachments(pool))
	r.With(auth.RequirePermission("finance.statutory_read", auth.AccessRead)).Get("/statutory/document-series", listDocumentSeries(pool))
	r.With(auth.RequirePermission("finance.statutory_write", auth.AccessWrite)).Post("/statutory/document-series", createDocumentSeries(pool))
	r.With(auth.RequirePermission("finance.statutory_write", auth.AccessWrite)).Patch("/statutory/document-series/{id}", patchDocumentSeries(pool))
	registerBIRStatutoryS1Routes(r, pool)
	registerBIRStatutoryS2Routes(r, pool)
	registerBIRStatutoryS3Routes(r, pool)
	registerBooksOfAccountsRoutes(r, pool)
	registerYearEndCloseRoutes(r, pool)
}

func getTaxpayerProfile(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		d, err := financedefaults.Load(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load taxpayer profile.", "ERR_INTERNAL")
			return
		}
		response.OK(w, TaxpayerProfile{
			RDOCode:          d.RDOCode,
			TaxRegime:        d.TaxRegime,
			RegistrationDate: d.RegistrationDate,
			LineOfBusiness:   d.LineOfBusiness,
			CORFileURL:       d.CORFileURL,
			CASFileURL:       d.CASFileURL,
			ATPFileURL:       d.ATPFileURL,
		}, "OK")
	}
}

func patchTaxpayerProfile(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body taxpayerProfileBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if body.TaxRegime != nil {
			regime := strings.ToLower(strings.TrimSpace(*body.TaxRegime))
			if regime != "" && regime != "vat" && regime != "non_vat" && regime != "percentage" {
				response.Validation(w, map[string]string{"tax_regime": "Must be vat, non_vat, or percentage."})
				return
			}
			if regime == "" {
				body.TaxRegime = nil
			} else {
				body.TaxRegime = &regime
			}
		}
		d, err := financedefaults.Load(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load defaults.", "ERR_INTERNAL")
			return
		}
		if body.RDOCode != nil {
			d.RDOCode = nullableTrim(body.RDOCode)
		}
		if body.TaxRegime != nil {
			d.TaxRegime = body.TaxRegime
		}
		if body.RegistrationDate != nil {
			d.RegistrationDate = nullableDate(body.RegistrationDate)
		}
		if body.LineOfBusiness != nil {
			d.LineOfBusiness = nullableTrim(body.LineOfBusiness)
		}
		if body.CORFileURL != nil {
			d.CORFileURL = nullableTrim(body.CORFileURL)
		}
		if body.CASFileURL != nil {
			d.CASFileURL = nullableTrim(body.CASFileURL)
		}
		if body.ATPFileURL != nil {
			d.ATPFileURL = nullableTrim(body.ATPFileURL)
		}
		if err := financedefaults.Save(r.Context(), pool, tu.TenantID, d); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save taxpayer profile.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.statutory.taxpayer_profile", "tenant_finance_defaults", nil, nil, body)
		d, _ = financedefaults.Load(r.Context(), pool, tu.TenantID)
		response.OK(w, TaxpayerProfile{
			RDOCode:          d.RDOCode,
			TaxRegime:        d.TaxRegime,
			RegistrationDate: d.RegistrationDate,
			LineOfBusiness:   d.LineOfBusiness,
			CORFileURL:       d.CORFileURL,
			CASFileURL:       d.CASFileURL,
			ATPFileURL:       d.ATPFileURL,
		}, "Saved.")
	}
}

func listDocumentSeries(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id, doc_type, prefix, start_no, end_no, next_no, permit_ref, cas_ref, is_active
			from public.fin_document_series
			where tenant_id = $1
			order by doc_type, prefix`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list document series.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []DocumentSeries
		for rows.Next() {
			var row DocumentSeries
			if err := rows.Scan(&row.ID, &row.DocType, &row.Prefix, &row.StartNo, &row.EndNo, &row.NextNo, &row.PermitRef, &row.CASRef, &row.IsActive); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read document series.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []DocumentSeries{}
		}
		response.OK(w, out, "OK")
	}
}

func validateDocumentSeriesBody(body documentSeriesBody, isCreate bool) map[string]string {
	errs := map[string]string{}
	docType := strings.TrimSpace(body.DocType)
	if docType == "" {
		errs["doc_type"] = "Document type is required."
	}
	if body.EndNo < 1 {
		errs["end_no"] = "End number must be at least 1."
	}
	startNo := int64(1)
	if body.StartNo != nil {
		startNo = *body.StartNo
	}
	if startNo < 1 {
		errs["start_no"] = "Start number must be at least 1."
	}
	if body.EndNo < startNo {
		errs["end_no"] = "End number must be >= start number."
	}
	nextNo := startNo
	if body.NextNo != nil {
		nextNo = *body.NextNo
	} else if !isCreate {
		nextNo = 0 // patch may omit
	}
	if isCreate && (nextNo < startNo || nextNo > body.EndNo) {
		errs["next_no"] = "Next number must be between start and end."
	}
	return errs
}

func createDocumentSeries(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body documentSeriesBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateDocumentSeriesBody(body, true); len(errs) > 0 {
			response.Validation(w, errs)
			return
		}
		startNo := int64(1)
		if body.StartNo != nil {
			startNo = *body.StartNo
		}
		nextNo := startNo
		if body.NextNo != nil {
			nextNo = *body.NextNo
		}
		active := true
		if body.IsActive != nil {
			active = *body.IsActive
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.fin_document_series (
			  tenant_id, doc_type, prefix, start_no, end_no, next_no, permit_ref, cas_ref, is_active
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
			returning id`,
			tu.TenantID, strings.TrimSpace(body.DocType), strings.TrimSpace(body.Prefix),
			startNo, body.EndNo, nextNo, nullableTrim(body.PermitRef), nullableTrim(body.CASRef), active,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create document series.", "ERR_INTERNAL")
			return
		}
		row := loadDocumentSeries(r.Context(), pool, tu.TenantID, id)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.statutory.document_series.create", "fin_document_series", &id, nil, body)
		response.OK(w, row, "Created.")
	}
}

func patchDocumentSeries(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body documentSeriesBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		current := loadDocumentSeries(r.Context(), pool, tu.TenantID, id)
		if current.ID == 0 {
			response.Err(w, http.StatusNotFound, "Not found.", "ERR_NOT_FOUND")
			return
		}
		docType := current.DocType
		if strings.TrimSpace(body.DocType) != "" {
			docType = strings.TrimSpace(body.DocType)
		}
		prefix := current.Prefix
		if body.Prefix != "" || (body.Prefix == "" && strings.TrimSpace(body.DocType) != "") {
			prefix = strings.TrimSpace(body.Prefix)
		}
		startNo := current.StartNo
		if body.StartNo != nil {
			startNo = *body.StartNo
		}
		endNo := current.EndNo
		if body.EndNo > 0 {
			endNo = body.EndNo
		}
		nextNo := current.NextNo
		if body.NextNo != nil {
			nextNo = *body.NextNo
		}
		active := current.IsActive
		if body.IsActive != nil {
			active = *body.IsActive
		}
		checkBody := documentSeriesBody{
			DocType: docType, Prefix: prefix, StartNo: &startNo, EndNo: endNo, NextNo: &nextNo,
		}
		if errs := validateDocumentSeriesBody(checkBody, false); len(errs) > 0 {
			response.Validation(w, errs)
			return
		}
		if nextNo < startNo || nextNo > endNo+1 {
			response.Validation(w, map[string]string{"next_no": "Next number must be between start and end (inclusive, +1 when exhausted)."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.fin_document_series set
			  doc_type = $3, prefix = $4, start_no = $5, end_no = $6, next_no = $7,
			  permit_ref = coalesce($8, permit_ref), cas_ref = coalesce($9, cas_ref),
			  is_active = $10, updated_at = now()
			where id = $1 and tenant_id = $2`,
			id, tu.TenantID, docType, prefix, startNo, endNo, nextNo,
			nullableTrim(body.PermitRef), nullableTrim(body.CASRef), active,
		)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Not found.", "ERR_NOT_FOUND")
			return
		}
		row := loadDocumentSeries(r.Context(), pool, tu.TenantID, id)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.statutory.document_series.update", "fin_document_series", &id, nil, body)
		response.OK(w, row, "Updated.")
	}
}

func loadDocumentSeries(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) DocumentSeries {
	var row DocumentSeries
	_ = pool.QueryRow(ctx, `
		select id, doc_type, prefix, start_no, end_no, next_no, permit_ref, cas_ref, is_active
		from public.fin_document_series where id = $1 and tenant_id = $2`, id, tenantID,
	).Scan(&row.ID, &row.DocType, &row.Prefix, &row.StartNo, &row.EndNo, &row.NextNo, &row.PermitRef, &row.CASRef, &row.IsActive)
	return row
}

type seriesQuerier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// allocateSeriesNumber returns the next document number from an active BIR series when configured.
func allocateSeriesNumber(ctx context.Context, q seriesQuerier, tenantID int64, docType string) (docNo string, ok bool, err error) {
	var prefix string
	var allocated, endNo int64
	err = q.QueryRow(ctx, `
		with picked as (
		  select id from public.fin_document_series
		  where tenant_id = $1 and doc_type = $2 and is_active = true and next_no <= end_no
		  order by id
		  limit 1
		  for update
		)
		update public.fin_document_series s
		set next_no = s.next_no + 1, updated_at = now()
		from picked
		where s.id = picked.id
		returning s.prefix, s.next_no - 1, s.end_no`, tenantID, docType).Scan(&prefix, &allocated, &endNo)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	width := len(strconv.FormatInt(endNo, 10))
	if width < 1 {
		width = 1
	}
	return prefix + fmt.Sprintf("%0*d", width, allocated), true, nil
}

type statutoryAttachmentVault struct {
	CORFileURL *string `json:"cor_file_url,omitempty"`
	CASFileURL *string `json:"cas_file_url,omitempty"`
	ATPFileURL *string `json:"atp_file_url,omitempty"`
}

type statutoryAttachmentBody struct {
	CORFileURL *string `json:"cor_file_url"`
	CASFileURL *string `json:"cas_file_url"`
	ATPFileURL *string `json:"atp_file_url"`
}

func getStatutoryAttachments(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		d, err := financedefaults.Load(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load attachments.", "ERR_INTERNAL")
			return
		}
		response.OK(w, statutoryAttachmentVault{
			CORFileURL: d.CORFileURL, CASFileURL: d.CASFileURL, ATPFileURL: d.ATPFileURL,
		}, "OK")
	}
}

func patchStatutoryAttachments(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body statutoryAttachmentBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		d, err := financedefaults.Load(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load defaults.", "ERR_INTERNAL")
			return
		}
		if body.CORFileURL != nil {
			d.CORFileURL = nullableTrim(body.CORFileURL)
		}
		if body.CASFileURL != nil {
			d.CASFileURL = nullableTrim(body.CASFileURL)
		}
		if body.ATPFileURL != nil {
			d.ATPFileURL = nullableTrim(body.ATPFileURL)
		}
		if err := financedefaults.Save(r.Context(), pool, tu.TenantID, d); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save attachments.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.statutory.attachments", "tenant_finance_defaults", nil, nil, body)
		d, _ = financedefaults.Load(r.Context(), pool, tu.TenantID)
		response.OK(w, statutoryAttachmentVault{
			CORFileURL: d.CORFileURL, CASFileURL: d.CASFileURL, ATPFileURL: d.ATPFileURL,
		}, "Saved.")
	}
}
