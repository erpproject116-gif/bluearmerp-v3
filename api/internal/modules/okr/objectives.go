package okr

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type Objective struct {
	ID          int64   `json:"id"`
	Title       string  `json:"title"`
	OwnerUserID *int64  `json:"owner_user_id,omitempty"`
	OwnerName   string  `json:"owner_name,omitempty"`
	PeriodStart string  `json:"period_start"`
	PeriodEnd   string  `json:"period_end"`
	Status      string  `json:"status"`
	Progress    float64 `json:"progress"`
	AtRisk      bool    `json:"at_risk"`
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`
}

type KeyResult struct {
	ID           int64   `json:"id"`
	ObjectiveID  int64   `json:"objective_id"`
	Title        string  `json:"title"`
	OwnerUserID  *int64  `json:"owner_user_id,omitempty"`
	OwnerName    string  `json:"owner_name,omitempty"`
	MetricUnit   string  `json:"metric_unit"`
	TargetValue  float64 `json:"target_value"`
	CurrentValue float64 `json:"current_value"`
	SortOrder    int     `json:"sort_order"`
	Progress     float64 `json:"progress"`
}

type objectiveBody struct {
	Title       string `json:"title"`
	OwnerUserID *int64 `json:"owner_user_id"`
	PeriodStart string `json:"period_start"`
	PeriodEnd   string `json:"period_end"`
	Status      string `json:"status"`
}

type objectivePatch struct {
	Title       *string `json:"title"`
	OwnerUserID *int64  `json:"owner_user_id"`
	PeriodStart *string `json:"period_start"`
	PeriodEnd   *string `json:"period_end"`
	Status      *string `json:"status"`
}

type keyResultBody struct {
	Title        string  `json:"title"`
	OwnerUserID  *int64  `json:"owner_user_id"`
	MetricUnit   string  `json:"metric_unit"`
	TargetValue  float64 `json:"target_value"`
	CurrentValue float64 `json:"current_value"`
	SortOrder    int     `json:"sort_order"`
}

type keyResultPatch struct {
	Title        *string  `json:"title"`
	OwnerUserID  *int64   `json:"owner_user_id"`
	MetricUnit   *string  `json:"metric_unit"`
	TargetValue  *float64 `json:"target_value"`
	CurrentValue *float64 `json:"current_value"`
	SortOrder    *int     `json:"sort_order"`
}

type ownerProgress struct {
	OwnerUserID *int64  `json:"owner_user_id,omitempty"`
	OwnerName   string  `json:"owner_name"`
	Progress    float64 `json:"progress"`
	Count       int64   `json:"count"`
}

type dashboardOut struct {
	ActiveCount    int64           `json:"active_count"`
	AvgProgress    float64         `json:"avg_progress"`
	AtRiskCount    int64           `json:"at_risk_count"`
	ByOwner        []ownerProgress `json:"by_owner"`
	Objectives     []Objective     `json:"objectives"`
}

func listObjectives(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "period_end", map[string]string{
			"title": "o.title", "period_end": "o.period_end", "status": "o.status",
		})
		offset := httputil.Offset(p)
		where := "o.tenant_id = $1"
		args := []any{tu.TenantID}
		n := 2
		if st := strings.TrimSpace(r.URL.Query().Get("status")); st != "" {
			where += fmt.Sprintf(" and o.status = $%d", n)
			args = append(args, st)
			n++
		}
		q := fmt.Sprintf(`
			select o.id, o.title, o.owner_user_id, coalesce(u.full_name,''),
			  o.period_start::text, o.period_end::text, o.status,
			  o.created_at::text, o.updated_at::text, count(*) over()
			from public.okr_objectives o
			left join public.users u on u.id = o.owner_user_id
			where %s
			order by %s %s
			limit $%d offset $%d`, where, p.Sort, orderSQL(p.Order), n, n+1)
		args = append(args, p.PageSize, offset)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list objectives.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []Objective
		var total int64
		for rows.Next() {
			var row Objective
			if err := rows.Scan(
				&row.ID, &row.Title, &row.OwnerUserID, &row.OwnerName,
				&row.PeriodStart, &row.PeriodEnd, &row.Status,
				&row.CreatedAt, &row.UpdatedAt, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read objectives.", "ERR_INTERNAL")
				return
			}
			row.Progress, _ = objectiveProgress(r.Context(), pool, row.ID)
			row.AtRisk = isAtRisk(row)
			out = append(out, row)
		}
		if out == nil {
			out = []Objective{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func getObjective(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		row, err := loadObjective(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Objective not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, row, "OK")
	}
}

func createObjective(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body objectiveBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		title := strings.TrimSpace(body.Title)
		if title == "" || body.PeriodStart == "" || body.PeriodEnd == "" {
			response.Validation(w, map[string]string{"title": "Title and period required."})
			return
		}
		status := body.Status
		if status == "" {
			status = "active"
		}
		owner := body.OwnerUserID
		if owner == nil {
			id := tu.AppUserID
			owner = &id
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.okr_objectives (
			  tenant_id, title, owner_user_id, period_start, period_end, status
			) values ($1,$2,$3,$4::date,$5::date,$6)
			returning id`,
			tu.TenantID, title, owner, body.PeriodStart, body.PeriodEnd, status,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create objective.", "ERR_INTERNAL")
			return
		}
		row, _ := loadObjective(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "Created")
	}
}

func patchObjective(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		existing, err := loadObjective(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Objective not found.", "ERR_NOT_FOUND")
			return
		}
		var body objectivePatch
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		title, owner, start, end, status := existing.Title, existing.OwnerUserID, existing.PeriodStart, existing.PeriodEnd, existing.Status
		if body.Title != nil {
			title = strings.TrimSpace(*body.Title)
		}
		if body.OwnerUserID != nil {
			owner = body.OwnerUserID
		}
		if body.PeriodStart != nil {
			start = *body.PeriodStart
		}
		if body.PeriodEnd != nil {
			end = *body.PeriodEnd
		}
		if body.Status != nil {
			status = *body.Status
		}
		_, err = pool.Exec(r.Context(), `
			update public.okr_objectives set
			  title=$1, owner_user_id=$2, period_start=$3::date, period_end=$4::date,
			  status=$5, updated_at=now()
			where id=$6 and tenant_id=$7`,
			title, owner, start, end, status, id, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update objective.", "ERR_INTERNAL")
			return
		}
		row, _ := loadObjective(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "OK")
	}
}

func listKeyResults(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		objID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		if !objectiveBelongs(r.Context(), pool, tu.TenantID, objID) {
			response.Err(w, http.StatusNotFound, "Objective not found.", "ERR_NOT_FOUND")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select kr.id, kr.objective_id, kr.title, kr.owner_user_id, coalesce(u.full_name,''),
			  kr.metric_unit, kr.target_value::float8, kr.current_value::float8, kr.sort_order
			from public.okr_key_results kr
			left join public.users u on u.id = kr.owner_user_id
			where kr.objective_id = $1
			order by kr.sort_order, kr.id`, objID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list key results.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []KeyResult
		for rows.Next() {
			var row KeyResult
			if err := rows.Scan(
				&row.ID, &row.ObjectiveID, &row.Title, &row.OwnerUserID, &row.OwnerName,
				&row.MetricUnit, &row.TargetValue, &row.CurrentValue, &row.SortOrder,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read key results.", "ERR_INTERNAL")
				return
			}
			row.Progress = krProgress(row.CurrentValue, row.TargetValue)
			out = append(out, row)
		}
		if out == nil {
			out = []KeyResult{}
		}
		response.OK(w, out, "OK")
	}
}

func createKeyResult(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		objID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		if !objectiveBelongs(r.Context(), pool, tu.TenantID, objID) {
			response.Err(w, http.StatusNotFound, "Objective not found.", "ERR_NOT_FOUND")
			return
		}
		var body keyResultBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		title := strings.TrimSpace(body.Title)
		if title == "" {
			response.Validation(w, map[string]string{"title": "Required."})
			return
		}
		unit := body.MetricUnit
		if unit == "" {
			unit = "percent"
		}
		if unit != "number" && unit != "percent" {
			response.Validation(w, map[string]string{"metric_unit": "Use number or percent."})
			return
		}
		target := body.TargetValue
		if target == 0 {
			target = 100
		}
		var id int64
		err = pool.QueryRow(r.Context(), `
			insert into public.okr_key_results (
			  objective_id, title, owner_user_id, metric_unit, target_value, current_value, sort_order
			) values ($1,$2,$3,$4,$5,$6,$7)
			returning id`,
			objID, title, body.OwnerUserID, unit, target, body.CurrentValue, body.SortOrder,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create key result.", "ERR_INTERNAL")
			return
		}
		row := KeyResult{
			ID: id, ObjectiveID: objID, Title: title, OwnerUserID: body.OwnerUserID,
			MetricUnit: unit, TargetValue: target, CurrentValue: body.CurrentValue, SortOrder: body.SortOrder,
		}
		row.Progress = krProgress(row.CurrentValue, row.TargetValue)
		response.OK(w, row, "Created")
	}
}

func patchKeyResult(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var existing KeyResult
		err = pool.QueryRow(r.Context(), `
			select kr.id, kr.objective_id, kr.title, kr.owner_user_id, coalesce(u.full_name,''),
			  kr.metric_unit, kr.target_value::float8, kr.current_value::float8, kr.sort_order
			from public.okr_key_results kr
			join public.okr_objectives o on o.id = kr.objective_id
			left join public.users u on u.id = kr.owner_user_id
			where kr.id=$1 and o.tenant_id=$2`, id, tu.TenantID).Scan(
			&existing.ID, &existing.ObjectiveID, &existing.Title, &existing.OwnerUserID, &existing.OwnerName,
			&existing.MetricUnit, &existing.TargetValue, &existing.CurrentValue, &existing.SortOrder,
		)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Key result not found.", "ERR_NOT_FOUND")
			return
		}
		var body keyResultPatch
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if body.Title != nil {
			existing.Title = strings.TrimSpace(*body.Title)
		}
		if body.OwnerUserID != nil {
			existing.OwnerUserID = body.OwnerUserID
		}
		if body.MetricUnit != nil {
			existing.MetricUnit = *body.MetricUnit
		}
		if body.TargetValue != nil {
			existing.TargetValue = *body.TargetValue
		}
		if body.CurrentValue != nil {
			existing.CurrentValue = *body.CurrentValue
		}
		if body.SortOrder != nil {
			existing.SortOrder = *body.SortOrder
		}
		_, err = pool.Exec(r.Context(), `
			update public.okr_key_results set
			  title=$1, owner_user_id=$2, metric_unit=$3, target_value=$4,
			  current_value=$5, sort_order=$6, updated_at=now()
			where id=$7`,
			existing.Title, existing.OwnerUserID, existing.MetricUnit,
			existing.TargetValue, existing.CurrentValue, existing.SortOrder, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update key result.", "ERR_INTERNAL")
			return
		}
		existing.Progress = krProgress(existing.CurrentValue, existing.TargetValue)
		response.OK(w, existing, "OK")
	}
}

func dashboardSummary(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		out := dashboardOut{ByOwner: []ownerProgress{}, Objectives: []Objective{}}
		rows, err := pool.Query(r.Context(), `
			select o.id, o.title, o.owner_user_id, coalesce(u.full_name,''),
			  o.period_start::text, o.period_end::text, o.status,
			  o.created_at::text, o.updated_at::text
			from public.okr_objectives o
			left join public.users u on u.id = o.owner_user_id
			where o.tenant_id=$1 and o.status='active'
			order by o.period_end`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load dashboard.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		ownerAgg := map[string]*ownerProgress{}
		var sum float64
		for rows.Next() {
			var row Objective
			if err := rows.Scan(
				&row.ID, &row.Title, &row.OwnerUserID, &row.OwnerName,
				&row.PeriodStart, &row.PeriodEnd, &row.Status,
				&row.CreatedAt, &row.UpdatedAt,
			); err != nil {
				continue
			}
			row.Progress, _ = objectiveProgress(r.Context(), pool, row.ID)
			row.AtRisk = isAtRisk(row)
			out.ActiveCount++
			sum += row.Progress
			if row.AtRisk {
				out.AtRiskCount++
			}
			out.Objectives = append(out.Objectives, row)
			key := row.OwnerName
			if key == "" {
				key = "Unassigned"
			}
			if _, ok := ownerAgg[key]; !ok {
				ownerAgg[key] = &ownerProgress{OwnerUserID: row.OwnerUserID, OwnerName: key}
			}
			ownerAgg[key].Count++
			ownerAgg[key].Progress += row.Progress
		}
		if out.ActiveCount > 0 {
			out.AvgProgress = sum / float64(out.ActiveCount)
		}
		for _, v := range ownerAgg {
			if v.Count > 0 {
				v.Progress = v.Progress / float64(v.Count)
			}
			out.ByOwner = append(out.ByOwner, *v)
		}
		w.Header().Set("Cache-Control", "private, max-age=30")
		response.OK(w, out, "OK")
	}
}

func loadObjective(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (Objective, error) {
	var row Objective
	err := pool.QueryRow(ctx, `
		select o.id, o.title, o.owner_user_id, coalesce(u.full_name,''),
		  o.period_start::text, o.period_end::text, o.status,
		  o.created_at::text, o.updated_at::text
		from public.okr_objectives o
		left join public.users u on u.id = o.owner_user_id
		where o.id=$1 and o.tenant_id=$2`, id, tenantID).Scan(
		&row.ID, &row.Title, &row.OwnerUserID, &row.OwnerName,
		&row.PeriodStart, &row.PeriodEnd, &row.Status,
		&row.CreatedAt, &row.UpdatedAt,
	)
	if err != nil {
		return row, err
	}
	row.Progress, _ = objectiveProgress(ctx, pool, id)
	row.AtRisk = isAtRisk(row)
	return row, nil
}

func objectiveProgress(ctx context.Context, pool *pgxpool.Pool, objectiveID int64) (float64, error) {
	rows, err := pool.Query(ctx, `
		select current_value::float8, target_value::float8
		from public.okr_key_results where objective_id=$1`, objectiveID)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	var sum float64
	var n int
	for rows.Next() {
		var cur, tgt float64
		if rows.Scan(&cur, &tgt) != nil {
			continue
		}
		sum += krProgress(cur, tgt)
		n++
	}
	if n == 0 {
		return 0, nil
	}
	return sum / float64(n), nil
}

func krProgress(current, target float64) float64 {
	if target <= 0 {
		return 0
	}
	p := (current / target) * 100
	if p > 100 {
		return 100
	}
	if p < 0 {
		return 0
	}
	return math.Round(p*10) / 10
}

func isAtRisk(o Objective) bool {
	if o.Status != "active" || o.Progress >= 40 {
		return false
	}
	// period_end within 30 days (inclusive) and still low progress
	// Compare as date strings YYYY-MM-DD works lexicographically.
	return daysUntil(o.PeriodEnd) < 30 && daysUntil(o.PeriodEnd) >= 0
}

func daysUntil(dateStr string) int {
	if len(dateStr) < 10 {
		return 999
	}
	var y, m, d int
	if _, err := fmt.Sscanf(dateStr[:10], "%d-%d-%d", &y, &m, &d); err != nil {
		return 999
	}
	end := time.Date(y, time.Month(m), d, 0, 0, 0, 0, time.UTC)
	now := time.Now().UTC().Truncate(24 * time.Hour)
	return int(end.Sub(now).Hours() / 24)
}

func objectiveBelongs(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) bool {
	var ok bool
	_ = pool.QueryRow(ctx, `
		select exists(select 1 from public.okr_objectives where id=$1 and tenant_id=$2)`,
		id, tenantID).Scan(&ok)
	return ok
}

func orderSQL(order string) string {
	if order == "desc" {
		return "desc"
	}
	return "asc"
}
