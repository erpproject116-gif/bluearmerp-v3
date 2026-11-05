package hr

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/customfields"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/formfields"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

const applicationFileMax = 25 << 20

var applicationStatuses = map[string]struct{}{
	"pooling": {}, "initial_interview": {}, "exam": {}, "final_interview": {},
	"onboarding": {}, "hired": {}, "rejected": {}, "terminated": {}, "resigned": {},
}

func registerPublicApplyRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/hr/apply/{code}/openings", listPublicOpenings(pool))
	r.Get("/hr/apply/{code}/draft", getPublicDraft(pool))
	r.Put("/hr/apply/{code}/draft", savePublicDraft(pool))
	r.Get("/hr/apply/{code}", getPublicApplyForm(pool))
	r.Post("/hr/apply/{code}", submitPublicApplication(pool))
}

func registerApplicationRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/applications", listApplications(pool))
	r.Get("/applications/{id}/comments", listApplicationComments(pool))
	r.Get("/applications/{id}/files/{fileId}", downloadApplicationFile(pool))
	r.Get("/applications/{id}", getApplication(pool))
	r.With(auth.RequirePermission("hr.employees", auth.AccessWrite)).Patch("/applications/{id}", patchApplication(pool))
	r.With(auth.RequirePermission("hr.employees", auth.AccessWrite)).Post("/applications/{id}/comments", addApplicationComment(pool))
	registerConvertHireRoute(r, pool)
	r.Get("/applicant-segments", listApplicantSegments(pool))
	r.With(auth.RequirePermission("hr.employees", auth.AccessWrite)).Post("/applicant-segments", createApplicantSegment(pool))
	r.With(auth.RequirePermission("hr.employees", auth.AccessWrite)).Post("/applicant-segments/{id}/actions/delete", deleteApplicantSegment(pool))
}

type applyForm struct {
	PositionDesired   string `json:"position_desired"`
	ApplicationDate   string `json:"application_date"`
	FullName          string `json:"full_name"`
	Gender            string `json:"gender"`
	CityAddress       string `json:"city_address"`
	ProvincialAddress string `json:"provincial_address"`
	Telephone         string `json:"telephone"`
	Cellphone         string `json:"cellphone"`
	Email             string `json:"email"`
	BirthDate         string `json:"birth_date"`
	Birthplace        string `json:"birthplace"`
	CivilStatus       string `json:"civil_status"`
	Citizenship       string `json:"citizenship"`
	Height            string `json:"height"`
	Weight            string `json:"weight"`
	Religion          string `json:"religion"`
	SpouseName        string `json:"spouse_name"`
	SpouseOccupation  string `json:"spouse_occupation"`
	FatherName        string `json:"father_name"`
	FatherOccupation  string `json:"father_occupation"`
	MotherName        string `json:"mother_name"`
	MotherOccupation  string `json:"mother_occupation"`
	Languages         string `json:"languages"`
	EmergencyName     string `json:"emergency_name"`
	EmergencyAddress  string `json:"emergency_address"`
	EmergencyPhone    string `json:"emergency_phone"`
	ElementarySchool  string `json:"elementary_school"`
	ElementaryYear    string `json:"elementary_year"`
	HighSchool        string `json:"high_school"`
	HighSchoolYear    string `json:"high_school_year"`
	College           string `json:"college"`
	CollegeYear       string `json:"college_year"`
	DegreeReceived    string `json:"degree_received"`
	SpecialSkills     string `json:"special_skills"`
	ResCertNo         string `json:"res_cert_no"`
	ResCertIssuedAt   string `json:"res_cert_issued_at"`
	ResCertIssuedOn   string `json:"res_cert_issued_on"`
	SSSNo             string `json:"sss_no"`
	TIN               string `json:"tin"`
	NBINo             string `json:"nbi_no"`
	PassportNo        string `json:"passport_no"`
	Certified         bool   `json:"certified"`
	SignatureDataURL  string `json:"signature_data_url"`
	ChildrenJSON      string `json:"children_json"`
	JobsJSON          string `json:"jobs_json"`
	ReferencesJSON    string `json:"references_json"`
	CustomValues      string `json:"custom_values"`
	JobPostingID      string `json:"job_posting_id"`
}

func tenantByCompanyCode(ctx context.Context, pool *pgxpool.Pool, code string) (int64, error) {
	var id int64
	err := pool.QueryRow(ctx, `
		select id from public.tenants
		where lower(company_code) = lower($1) and status = 'active'`, strings.TrimSpace(code)).Scan(&id)
	return id, err
}

func listPublicOpenings(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tenantID, err := tenantByCompanyCode(r.Context(), pool, chi.URLParam(r, "code"))
		if err != nil {
			response.Err(w, http.StatusNotFound, "Company not found.", "ERR_NOT_FOUND")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select p.id, p.title, s.site_name, p.headcount
			from public.hr_job_postings p
			join public.hr_client_sites s on s.id = p.site_id and s.tenant_id = p.tenant_id
			where p.tenant_id = $1 and p.status = 'open'
			order by p.id desc`, tenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load openings.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id int64
			var title, site string
			var head int
			if err := rows.Scan(&id, &title, &site, &head); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load openings.", "ERR_INTERNAL")
				return
			}
			out = append(out, map[string]any{"id": id, "title": title, "site_name": site, "headcount": head})
		}
		response.OK(w, out, "OK")
	}
}

func getPublicDraft(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tenantID, err := tenantByCompanyCode(r.Context(), pool, chi.URLParam(r, "code"))
		if err != nil {
			response.Err(w, http.StatusNotFound, "Company not found.", "ERR_NOT_FOUND")
			return
		}
		token := strings.TrimSpace(r.URL.Query().Get("token"))
		if token == "" {
			response.OK(w, map[string]any{"form": nil}, "OK")
			return
		}
		sum := sha256.Sum256([]byte(token))
		var form []byte
		err = pool.QueryRow(r.Context(), `
			select form_json from public.hr_application_drafts
			where tenant_id = $1 and token_hash = $2 and expires_at > now()`,
			tenantID, hex.EncodeToString(sum[:])).Scan(&form)
		if err != nil {
			response.OK(w, map[string]any{"form": nil}, "OK")
			return
		}
		response.OK(w, map[string]any{"form": json.RawMessage(form)}, "OK")
	}
}

func savePublicDraft(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tenantID, err := tenantByCompanyCode(r.Context(), pool, chi.URLParam(r, "code"))
		if err != nil {
			response.Err(w, http.StatusNotFound, "Company not found.", "ERR_NOT_FOUND")
			return
		}
		var body struct {
			Token string          `json:"token"`
			Form  json.RawMessage `json:"form"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid JSON.", "ERR_BAD_REQUEST")
			return
		}
		token := strings.TrimSpace(body.Token)
		if token == "" {
			buf := make([]byte, 16)
			if _, err := rand.Read(buf); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to save the draft.", "ERR_INTERNAL")
				return
			}
			token = hex.EncodeToString(buf)
		}
		form := body.Form
		if len(form) == 0 {
			form = []byte("{}")
		}
		sum := sha256.Sum256([]byte(token))
		_, err = pool.Exec(r.Context(), `
			insert into public.hr_application_drafts (tenant_id, token_hash, form_json, expires_at)
			values ($1, $2, $3, now() + interval '30 days')
			on conflict (tenant_id, token_hash) do update
			set form_json = excluded.form_json, expires_at = excluded.expires_at`,
			tenantID, hex.EncodeToString(sum[:]), form)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save the draft.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"token": token}, "Saved.")
	}
}

func getPublicApplyForm(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tenantID, err := tenantByCompanyCode(r.Context(), pool, chi.URLParam(r, "code"))
		if err != nil {
			response.Err(w, http.StatusNotFound, "Application form not found.", "ERR_NOT_FOUND")
			return
		}
		defs, _ := customfields.ListDefinitions(r.Context(), pool, tenantID, "hr_application", true)
		fields, ferr := formfields.LoadMergedSettings(r.Context(), pool, tenantID, "hr_application")
		if ferr != nil {
			fields = nil
		}
		visible := make([]formfields.FieldSetting, 0, len(fields))
		for _, f := range fields {
			if f.IsVisible && f.IsActive {
				visible = append(visible, f)
			}
		}
		response.OK(w, map[string]any{
			"company_code":   chi.URLParam(r, "code"),
			"custom_fields":  defs,
			"fields":         visible,
		}, "OK")
	}
}

func submitPublicApplication(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tenantID, err := tenantByCompanyCode(r.Context(), pool, chi.URLParam(r, "code"))
		if err != nil {
			response.Err(w, http.StatusNotFound, "Application form not found.", "ERR_NOT_FOUND")
			return
		}
		if err := r.ParseMultipartForm(applicationFileMax * 4); err != nil {
			response.Err(w, http.StatusBadRequest, "The form is too large or incomplete.", "ERR_VALIDATION")
			return
		}
		form := applyFormFromRequest(r)
		errs := map[string]string{}
		if strings.TrimSpace(form.FullName) == "" {
			errs["full_name"] = "Name is required."
		}
		if !form.Certified {
			errs["certified"] = "Confirm that the information is true and correct."
		}
		if strings.TrimSpace(form.SignatureDataURL) == "" {
			errs["signature_data_url"] = "Signature is required."
		}
		selfie, selfieErr := oneUpload(r, "selfie", true)
		if selfieErr != "" {
			errs["selfie"] = selfieErr
		}
		ids, idErr := manyUploads(r, "id_photos", true)
		if idErr != "" {
			errs["id_photos"] = idErr
		}
		resume, resumeErr := oneUpload(r, "resume", false)
		if resumeErr != "" {
			errs["resume"] = resumeErr
		}
		if len(errs) > 0 {
			response.Validation(w, errs)
			return
		}
		children := decodeRows(form.ChildrenJSON)
		jobs := decodeRows(form.JobsJSON)
		refs := decodeRows(form.ReferencesJSON)
		custom := map[string]any{}
		_ = json.Unmarshal([]byte(form.CustomValues), &custom)

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Could not save the application.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		personID, duplicate, err := matchOrCreatePerson(r.Context(), tx, tenantID, form)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Could not save the application.", "ERR_INTERNAL")
			return
		}
		var postingID *int64
		if id, perr := strconv.ParseInt(strings.TrimSpace(form.JobPostingID), 10, 64); perr == nil && id > 0 {
			var okSite bool
			_ = tx.QueryRow(r.Context(), `
				select exists(select 1 from public.hr_job_postings where id = $1 and tenant_id = $2 and status = 'open')`,
				id, tenantID).Scan(&okSite)
			if okSite {
				postingID = &id
				if form.PositionDesired == "" {
					var title string
					if terr := tx.QueryRow(r.Context(), `select title from public.hr_job_postings where id = $1`, id).Scan(&title); terr == nil {
						form.PositionDesired = title
					}
				}
			}
		}
		var appID int64
		err = tx.QueryRow(r.Context(), `
			insert into public.hr_applications (
			  tenant_id, person_id, position_desired, application_date, gender, city_address, provincial_address,
			  telephone, cellphone, email, birth_date, birthplace, civil_status, citizenship, height, weight, religion,
			  spouse_name, spouse_occupation, father_name, father_occupation, mother_name, mother_occupation, languages,
			  emergency_name, emergency_address, emergency_phone, elementary_school, elementary_year, high_school, high_school_year,
			  college, college_year, degree_received, special_skills, res_cert_no, res_cert_issued_at, res_cert_issued_on,
			  sss_no, tin, nbi_no, passport_no, certified, signature_data_url, job_posting_id
			) values (
			  $1,$2,$3,nullif($4,'')::date,$5,$6,$7,$8,$9,$10,nullif($11,'')::date,$12,$13,$14,$15,$16,$17,
			  $18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,nullif($38,'')::date,
			  $39,$40,$41,$42,$43,$44,$45
			) returning id`,
			tenantID, personID, form.PositionDesired, form.ApplicationDate, form.Gender, form.CityAddress, form.ProvincialAddress,
			form.Telephone, form.Cellphone, form.Email, form.BirthDate, form.Birthplace, form.CivilStatus, form.Citizenship, form.Height, form.Weight, form.Religion,
			form.SpouseName, form.SpouseOccupation, form.FatherName, form.FatherOccupation, form.MotherName, form.MotherOccupation, form.Languages,
			form.EmergencyName, form.EmergencyAddress, form.EmergencyPhone, form.ElementarySchool, form.ElementaryYear, form.HighSchool, form.HighSchoolYear,
			form.College, form.CollegeYear, form.DegreeReceived, form.SpecialSkills, form.ResCertNo, form.ResCertIssuedAt, form.ResCertIssuedOn,
			form.SSSNo, form.TIN, form.NBINo, form.PassportNo, form.Certified, form.SignatureDataURL, postingID,
		).Scan(&appID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Could not save the application.", "ERR_INTERNAL")
			return
		}
		if fieldErrs := customfields.ValidateAndSave(r.Context(), tx, tenantID, "hr_application", appID, custom); len(fieldErrs) > 0 {
			response.Validation(w, fieldErrs)
			return
		}
		for _, row := range children {
			if strings.TrimSpace(row["name"]) == "" {
				continue
			}
			if _, err := tx.Exec(r.Context(), `insert into public.hr_application_children (application_id, child_name, birth_date) values ($1,$2,nullif($3,'')::date)`, appID, row["name"], row["birth_date"]); err != nil {
				response.Err(w, http.StatusInternalServerError, "Could not save the application.", "ERR_INTERNAL")
				return
			}
		}
		for _, row := range jobs {
			if _, err := tx.Exec(r.Context(), `insert into public.hr_application_jobs (application_id, company_name, position, started_on, ended_on) values ($1,$2,$3,nullif($4,'')::date,nullif($5,'')::date)`, appID, row["company"], row["position"], row["from"], row["to"]); err != nil {
				response.Err(w, http.StatusInternalServerError, "Could not save the application.", "ERR_INTERNAL")
				return
			}
		}
		for _, row := range refs {
			if _, err := tx.Exec(r.Context(), `insert into public.hr_application_references (application_id, ref_name, position, company_name, contact_no) values ($1,$2,$3,$4,$5)`, appID, row["name"], row["position"], row["company"], row["contact"]); err != nil {
				response.Err(w, http.StatusInternalServerError, "Could not save the application.", "ERR_INTERNAL")
				return
			}
		}
		if err := saveAppFile(r.Context(), tx, tenantID, appID, "selfie", selfie); err != nil || saveMany(r.Context(), tx, tenantID, appID, "id_photo", ids) != nil || saveAppFile(r.Context(), tx, tenantID, appID, "resume", resume) != nil {
			response.Err(w, http.StatusInternalServerError, "Could not save the application files.", "ERR_INTERNAL")
			return
		}
		if applicationCreatesEmployee("pooling") {
			response.Err(w, http.StatusInternalServerError, "An application must not create an employee.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Could not save the application.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"id": appID, "person_id": personID, "duplicate": duplicate, "status": "pooling"}, "Created.")
	}
}

func applyFormFromRequest(r *http.Request) applyForm {
	g := func(k string) string { return strings.TrimSpace(r.FormValue(k)) }
	return applyForm{
		PositionDesired: g("position_desired"), ApplicationDate: g("application_date"), FullName: g("full_name"), Gender: g("gender"),
		JobPostingID: g("job_posting_id"),
		CityAddress: g("city_address"), ProvincialAddress: g("provincial_address"), Telephone: g("telephone"), Cellphone: g("cellphone"), Email: g("email"),
		BirthDate: g("birth_date"), Birthplace: g("birthplace"), CivilStatus: g("civil_status"), Citizenship: g("citizenship"), Height: g("height"), Weight: g("weight"), Religion: g("religion"),
		SpouseName: g("spouse_name"), SpouseOccupation: g("spouse_occupation"), FatherName: g("father_name"), FatherOccupation: g("father_occupation"),
		MotherName: g("mother_name"), MotherOccupation: g("mother_occupation"), Languages: g("languages"),
		EmergencyName: g("emergency_name"), EmergencyAddress: g("emergency_address"), EmergencyPhone: g("emergency_phone"),
		ElementarySchool: g("elementary_school"), ElementaryYear: g("elementary_year"), HighSchool: g("high_school"), HighSchoolYear: g("high_school_year"),
		College: g("college"), CollegeYear: g("college_year"), DegreeReceived: g("degree_received"), SpecialSkills: g("special_skills"),
		ResCertNo: g("res_cert_no"), ResCertIssuedAt: g("res_cert_issued_at"), ResCertIssuedOn: g("res_cert_issued_on"),
		SSSNo: g("sss_no"), TIN: g("tin"), NBINo: g("nbi_no"), PassportNo: g("passport_no"),
		Certified:        r.FormValue("certified") == "true" || r.FormValue("certified") == "on",
		SignatureDataURL: r.FormValue("signature_data_url"),
		ChildrenJSON:     r.FormValue("children_json"), JobsJSON: r.FormValue("jobs_json"), ReferencesJSON: r.FormValue("references_json"),
		CustomValues: r.FormValue("custom_values"),
	}
}

func matchOrCreatePerson(ctx context.Context, tx pgx.Tx, tenantID int64, form applyForm) (int64, bool, error) {
	var id int64
	err := tx.QueryRow(ctx, `
		select id from public.hr_applicant_people
		where tenant_id = $1 and (
		  ($2 <> '' and lower(email) = lower($2))
		  or ($3 <> '' and mobile = $3)
		  or ($4 <> '' and tin = $4)
		  or ($5 <> '' and sss_no = $5)
		  or ($6 <> '' and nbi_no = $6)
		  or ($7 <> '' and passport_no = $7)
		  or ($8 <> '' and res_cert_no = $8)
		or ($9 <> '' and nullif($10,'') is not null and lower(full_name) = lower($9) and birth_date = nullif($10,'')::date)
		)
		order by id limit 1`,
		tenantID, form.Email, form.Cellphone, form.TIN, form.SSSNo, form.NBINo, form.PassportNo, form.ResCertNo, form.FullName, form.BirthDate,
	).Scan(&id)
	if err == nil {
		return id, true, nil
	}
	if err != pgx.ErrNoRows {
		return 0, false, err
	}
	err = tx.QueryRow(ctx, `
		insert into public.hr_applicant_people
		  (tenant_id, full_name, email, mobile, birth_date, tin, sss_no, nbi_no, passport_no, res_cert_no)
		values ($1,$2,$3,$4,nullif($5,'')::date,$6,$7,$8,$9,$10) returning id`,
		tenantID, form.FullName, form.Email, form.Cellphone, form.BirthDate, form.TIN, form.SSSNo, form.NBINo, form.PassportNo, form.ResCertNo,
	).Scan(&id)
	return id, false, err
}

type uploadPart struct {
	Name string
	MIME string
	Body []byte
}

func oneUpload(r *http.Request, field string, imageOnly bool) (*uploadPart, string) {
	file, hdr, err := r.FormFile(field)
	if err == http.ErrMissingFile {
		return nil, ""
	}
	if err != nil {
		return nil, "Could not read the file."
	}
	defer file.Close()
	if hdr.Size > applicationFileMax {
		return nil, "Each file must be 25 MB or smaller."
	}
	body, err := io.ReadAll(io.LimitReader(file, applicationFileMax+1))
	if err != nil || len(body) > applicationFileMax {
		return nil, "Each file must be 25 MB or smaller."
	}
	mime := hdr.Header.Get("Content-Type")
	name := strings.ToLower(hdr.Filename)
	if imageOnly && !isImageUpload(hdr.Filename, mime) {
		return nil, "Use a photo."
	}
	if field == "resume" && !strings.HasSuffix(name, ".pdf") && !strings.HasSuffix(name, ".doc") && !strings.HasSuffix(name, ".docx") {
		return nil, "Resume must be PDF or Word."
	}
	return &uploadPart{Name: hdr.Filename, MIME: mime, Body: body}, ""
}

func manyUploads(r *http.Request, field string, imageOnly bool) ([]uploadPart, string) {
	if r.MultipartForm == nil || r.MultipartForm.File == nil {
		return nil, ""
	}
	headers := r.MultipartForm.File[field]
	out := make([]uploadPart, 0, len(headers))
	for _, hdr := range headers {
		file, err := hdr.Open()
		if err != nil {
			return nil, "Could not read a file."
		}
		body, err := io.ReadAll(io.LimitReader(file, applicationFileMax+1))
		file.Close()
		if err != nil || len(body) > applicationFileMax {
			return nil, "Each file must be 25 MB or smaller."
		}
		mime := hdr.Header.Get("Content-Type")
		if imageOnly && !isImageUpload(hdr.Filename, mime) {
			return nil, "Use a photo."
		}
		out = append(out, uploadPart{Name: hdr.Filename, MIME: mime, Body: body})
	}
	return out, ""
}

func saveAppFile(ctx context.Context, tx pgx.Tx, tenantID, appID int64, kind string, part *uploadPart) error {
	if part == nil {
		return nil
	}
	_, err := tx.Exec(ctx, `insert into public.hr_application_files (tenant_id, application_id, kind, file_name, mime_type, file_bytes) values ($1,$2,$3,$4,$5,$6)`, tenantID, appID, kind, part.Name, part.MIME, part.Body)
	return err
}

func saveMany(ctx context.Context, tx pgx.Tx, tenantID, appID int64, kind string, parts []uploadPart) error {
	for i := range parts {
		if err := saveAppFile(ctx, tx, tenantID, appID, kind, &parts[i]); err != nil {
			return err
		}
	}
	return nil
}

func decodeRows(raw string) []map[string]string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	var rows []map[string]string
	_ = json.Unmarshal([]byte(raw), &rows)
	return rows
}

func listApplications(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		args := []any{tu.TenantID}
		where := "a.tenant_id = $1"
		if v := r.URL.Query().Get("industry_id"); v != "" {
			args = append(args, v)
			where += fmt.Sprintf(" and a.industry_id = $%d", len(args))
		}
		if v := r.URL.Query().Get("workplace_type_id"); v != "" {
			args = append(args, v)
			where += fmt.Sprintf(" and a.workplace_type_id = $%d", len(args))
		}
		rows, err := pool.Query(r.Context(), `
			select a.id, p.full_name, a.status, a.position_desired, coalesce(a.email,''), coalesce(a.cellphone,''),
			       coalesce(ind.name,''), coalesce(wp.name,''), a.industry_id, a.workplace_type_id, a.created_at::text,
			       a.job_posting_id, coalesce(jp.title,'')
			from public.hr_applications a
			join public.hr_applicant_people p on p.id = a.person_id
			left join public.hr_applicant_segments ind on ind.id = a.industry_id
			left join public.hr_applicant_segments wp on wp.id = a.workplace_type_id
			left join public.hr_job_postings jp on jp.id = a.job_posting_id and jp.tenant_id = a.tenant_id
			where `+where+` order by a.created_at desc limit 500`, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load applications.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id int64
			var name, status, position, email, mobile, industry, workplace, created, postingTitle string
			var industryID, workplaceID, postingID *int64
			if err := rows.Scan(&id, &name, &status, &position, &email, &mobile, &industry, &workplace, &industryID, &workplaceID, &created, &postingID, &postingTitle); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load applications.", "ERR_INTERNAL")
				return
			}
			out = append(out, map[string]any{
				"id": id, "full_name": name, "status": status, "position_desired": position, "email": email, "cellphone": mobile,
				"industry": industry, "workplace": workplace, "industry_id": industryID, "workplace_type_id": workplaceID, "created_at": created,
				"job_posting_id": postingID, "job_posting_title": postingTitle,
			})
		}
		response.OK(w, out, "OK")
	}
}

func getApplication(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		id := chi.URLParam(r, "id")
		var raw []byte
		err := pool.QueryRow(r.Context(), `
			select to_jsonb(a) - 'signature_data_url' || jsonb_build_object(
			  'full_name', p.full_name,
			  'has_signature', a.signature_data_url <> '',
			  'job_posting_title', coalesce(jp.title, '')
			)
			from public.hr_applications a
			join public.hr_applicant_people p on p.id = a.person_id
			left join public.hr_job_postings jp on jp.id = a.job_posting_id and jp.tenant_id = a.tenant_id
			where a.id = $1 and a.tenant_id = $2`, id, tu.TenantID).Scan(&raw)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Application not found.", "ERR_NOT_FOUND")
			return
		}
		var app map[string]any
		if err := json.Unmarshal(raw, &app); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to read the application.", "ERR_INTERNAL")
			return
		}
		app["children"] = applicationJSONList(r.Context(), pool, `select coalesce(json_agg(json_build_object('child_name', child_name, 'birth_date', birth_date)), '[]'::json) from public.hr_application_children where application_id=$1`, id)
		app["jobs"] = applicationJSONList(r.Context(), pool, `select coalesce(json_agg(json_build_object('company_name', company_name, 'position', position, 'started_on', started_on, 'ended_on', ended_on)), '[]'::json) from public.hr_application_jobs where application_id=$1`, id)
		app["references"] = applicationJSONList(r.Context(), pool, `select coalesce(json_agg(json_build_object('ref_name', ref_name, 'position', position, 'company_name', company_name, 'contact_no', contact_no)), '[]'::json) from public.hr_application_references where application_id=$1`, id)
		app["files"] = applicationJSONList(r.Context(), pool, `select coalesce(json_agg(json_build_object('id', id, 'kind', kind, 'file_name', file_name, 'mime_type', mime_type) order by id), '[]'::json) from public.hr_application_files where application_id=$1 and tenant_id=$2`, id, tu.TenantID)
		delete(app, "signature_data_url")
		response.OK(w, app, "OK")
	}
}

func applicationJSONList(ctx context.Context, pool *pgxpool.Pool, query string, args ...any) json.RawMessage {
	var raw []byte
	if err := pool.QueryRow(ctx, query, args...).Scan(&raw); err != nil || len(raw) == 0 {
		return json.RawMessage("[]")
	}
	return json.RawMessage(raw)
}

func listApplicationComments(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select c.body, c.file_name, c.created_at::text
			from public.hr_application_comments c
			join public.hr_applications a on a.id = c.application_id
			where c.application_id = $1 and a.tenant_id = $2
			order by c.created_at`, chi.URLParam(r, "id"), tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load comments.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]string{}
		for rows.Next() {
			var body, name, created string
			if err := rows.Scan(&body, &name, &created); err != nil {
				continue
			}
			out = append(out, map[string]string{"body": body, "file_name": name, "created_at": created})
		}
		response.OK(w, out, "OK")
	}
}

func downloadApplicationFile(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		var name, mime string
		var body []byte
		err := pool.QueryRow(r.Context(), `
			select file_name, mime_type, file_bytes
			from public.hr_application_files
			where id = $1 and application_id = $2 and tenant_id = $3`,
			chi.URLParam(r, "fileId"), chi.URLParam(r, "id"), tu.TenantID).Scan(&name, &mime, &body)
		if err != nil {
			response.Err(w, http.StatusNotFound, "File not found.", "ERR_NOT_FOUND")
			return
		}
		if mime == "" {
			mime = "application/octet-stream"
		}
		name = strings.NewReplacer(`"`, "", "\n", "", "\r", "").Replace(name)
		w.Header().Set("Content-Type", mime)
		w.Header().Set("Content-Disposition", `attachment; filename="`+name+`"`)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(body)
	}
}

func patchApplication(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		var body struct {
			Status          *string `json:"status"`
			IndustryID      *int64  `json:"industry_id"`
			WorkplaceTypeID *int64  `json:"workplace_type_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid JSON.", "ERR_BAD_REQUEST")
			return
		}
		id := chi.URLParam(r, "id")
		if body.Status != nil {
			if _, ok := applicationStatuses[*body.Status]; !ok {
				response.Validation(w, map[string]string{"status": "Unknown status."})
				return
			}
			if applicationCreatesEmployee(*body.Status) {
				response.Err(w, http.StatusInternalServerError, "Status must not create an employee.", "ERR_INTERNAL")
				return
			}
		}
		tag, err := pool.Exec(r.Context(), `
			update public.hr_applications set
			  status = coalesce($3, status),
			  industry_id = case when $4::bigint is null then industry_id else $4 end,
			  workplace_type_id = case when $5::bigint is null then workplace_type_id else $5 end,
			  updated_at = now()
			where id = $1 and tenant_id = $2`, id, tu.TenantID, body.Status, body.IndustryID, body.WorkplaceTypeID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Application not found.", "ERR_NOT_FOUND")
			return
		}
		appID, _ := parseID(id)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "hr.application.update", "hr_application", &appID, nil, body)
		response.OK(w, map[string]any{"ok": true}, "Updated.")
	}
}

func addApplicationComment(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		if err := r.ParseMultipartForm(applicationFileMax); err != nil && r.ParseForm() != nil {
			response.Err(w, http.StatusBadRequest, "Invalid form.", "ERR_VALIDATION")
			return
		}
		part, msg := oneUpload(r, "file", false)
		if msg != "" {
			response.Validation(w, map[string]string{"file": msg})
			return
		}
		id := chi.URLParam(r, "id")
		var name, mime string
		var body []byte
		if part != nil {
			name, mime, body = part.Name, part.MIME, part.Body
		}
		var commentID int64
		err := pool.QueryRow(r.Context(), `
			insert into public.hr_application_comments (tenant_id, application_id, body, file_name, mime_type, file_bytes, created_by)
			select $1, a.id, $3, $4, $5, $6, $7 from public.hr_applications a where a.id = $2 and a.tenant_id = $1
			returning id`, tu.TenantID, id, r.FormValue("body"), name, mime, body, tu.AppUserID).Scan(&commentID)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Application not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"id": commentID}, "Created.")
	}
}

func listApplicantSegments(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		rows, err := pool.Query(r.Context(), `select id, kind, name from public.hr_applicant_segments where tenant_id=$1 order by kind, name`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load lists.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id int64
			var kind, name string
			_ = rows.Scan(&id, &kind, &name)
			out = append(out, map[string]any{"id": id, "kind": kind, "name": name})
		}
		response.OK(w, out, "OK")
	}
}

func createApplicantSegment(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		var body struct {
			Kind string `json:"kind"`
			Name string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid JSON.", "ERR_BAD_REQUEST")
			return
		}
		if body.Kind != "industry" && body.Kind != "workplace" || strings.TrimSpace(body.Name) == "" {
			response.Validation(w, map[string]string{"name": "Choose industry or workplace and enter a name."})
			return
		}
		var id int64
		err := pool.QueryRow(r.Context(), `insert into public.hr_applicant_segments (tenant_id, kind, name) values ($1,$2,$3) returning id`, tu.TenantID, body.Kind, strings.TrimSpace(body.Name)).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusConflict, "That name is already on the list.", "ERR_CONFLICT")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Created.")
	}
}

func deleteApplicantSegment(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		tag, err := pool.Exec(r.Context(), `delete from public.hr_applicant_segments where id=$1 and tenant_id=$2`, chi.URLParam(r, "id"), tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "List item not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"ok": true}, "Deleted.")
	}
}

func isImageUpload(name, mime string) bool {
	if strings.HasPrefix(strings.ToLower(mime), "image/") {
		return true
	}
	n := strings.ToLower(name)
	return strings.HasSuffix(n, ".jpg") || strings.HasSuffix(n, ".jpeg") || strings.HasSuffix(n, ".png") || strings.HasSuffix(n, ".webp") || strings.HasSuffix(n, ".gif")
}
