package console

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/plans"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func (s *service) listPlans(w http.ResponseWriter, r *http.Request) {
	includeInactive := r.URL.Query().Get("include_inactive") == "1"
	list, err := plans.List(r.Context(), s.pool, !includeInactive, false)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to list plans.", "ERR_INTERNAL")
		return
	}
	response.OK(w, map[string]any{"plans": list}, "OK")
}

func (s *service) getPlan(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		response.Validation(w, map[string]string{"id": "Invalid plan id."})
		return
	}
	p, err := plans.GetByID(r.Context(), s.pool, id)
	if err != nil {
		if err == pgx.ErrNoRows {
			response.Err(w, http.StatusNotFound, "Plan not found.", "ERR_NOT_FOUND")
			return
		}
		response.Err(w, http.StatusInternalServerError, "Failed to load plan.", "ERR_INTERNAL")
		return
	}
	response.OK(w, map[string]any{"plan": p}, "OK")
}

type planBody struct {
	PlanCode             string          `json:"plan_code"`
	DisplayName          string          `json:"display_name"`
	Description          string          `json:"description"`
	LockInMonths         int             `json:"lock_in_months"`
	RegularMonthlyAmount float64         `json:"regular_monthly_amount"`
	RegularTotalAmount   *float64        `json:"regular_total_amount"`
	PromoMonthlyAmount   *float64        `json:"promo_monthly_amount"`
	PromoTotalAmount     *float64        `json:"promo_total_amount"`
	PromoLabel           string          `json:"promo_label"`
	PromoStartsAt        *string         `json:"promo_starts_at"`
	PromoEndsAt          *string         `json:"promo_ends_at"`
	Inclusions           json.RawMessage `json:"inclusions"`
	IsTrial              bool            `json:"is_trial"`
	IsDemo               bool            `json:"is_demo"`
	IsActive             bool            `json:"is_active"`
	IsPublic             bool            `json:"is_public"`
	SortOrder            int             `json:"sort_order"`
	TrialDays            int             `json:"trial_days"`
}

func parsePlanBody(body planBody) (plans.UpsertInput, map[string]string) {
	errs := map[string]string{}
	code := strings.TrimSpace(body.PlanCode)
	name := strings.TrimSpace(body.DisplayName)
	if code == "" {
		errs["plan_code"] = "Plan code is required."
	}
	if name == "" {
		errs["display_name"] = "Display name is required."
	}
	if body.RegularMonthlyAmount < 0 {
		errs["regular_monthly_amount"] = "Must be zero or positive."
	}
	if body.TrialDays < 0 {
		errs["trial_days"] = "Must be zero or positive."
	}
	in := plans.UpsertInput{
		PlanCode:             code,
		DisplayName:          name,
		Description:          strings.TrimSpace(body.Description),
		LockInMonths:         body.LockInMonths,
		RegularMonthlyAmount: body.RegularMonthlyAmount,
		RegularTotalAmount:   body.RegularTotalAmount,
		PromoMonthlyAmount:   body.PromoMonthlyAmount,
		PromoTotalAmount:     body.PromoTotalAmount,
		PromoLabel:           strings.TrimSpace(body.PromoLabel),
		Inclusions:           body.Inclusions,
		IsTrial:              body.IsTrial,
		IsDemo:               body.IsDemo,
		IsActive:             body.IsActive,
		IsPublic:             body.IsPublic,
		SortOrder:            body.SortOrder,
		TrialDays:            body.TrialDays,
	}
	if body.PromoStartsAt != nil && strings.TrimSpace(*body.PromoStartsAt) != "" {
		t, err := time.Parse(time.RFC3339, strings.TrimSpace(*body.PromoStartsAt))
		if err != nil {
			// try date-only
			t2, err2 := time.Parse("2006-01-02", strings.TrimSpace(*body.PromoStartsAt))
			if err2 != nil {
				errs["promo_starts_at"] = "Invalid date."
			} else {
				in.PromoStartsAt = &t2
			}
		} else {
			in.PromoStartsAt = &t
		}
	}
	if body.PromoEndsAt != nil && strings.TrimSpace(*body.PromoEndsAt) != "" {
		t, err := time.Parse(time.RFC3339, strings.TrimSpace(*body.PromoEndsAt))
		if err != nil {
			t2, err2 := time.Parse("2006-01-02", strings.TrimSpace(*body.PromoEndsAt))
			if err2 != nil {
				errs["promo_ends_at"] = "Invalid date."
			} else {
				// end of day
				t2 = t2.Add(23*time.Hour + 59*time.Minute + 59*time.Second)
				in.PromoEndsAt = &t2
			}
		} else {
			in.PromoEndsAt = &t
		}
	}
	return in, errs
}

func (s *service) createPlan(w http.ResponseWriter, r *http.Request) {
	var body planBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Validation(w, map[string]string{"body": "Invalid JSON."})
		return
	}
	in, errs := parsePlanBody(body)
	if len(errs) > 0 {
		response.Validation(w, errs)
		return
	}
	id, err := plans.Create(r.Context(), s.pool, in)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to create plan.", "ERR_INTERNAL")
		return
	}
	response.OK(w, map[string]any{"id": id}, "Plan created.")
}

func (s *service) patchPlan(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		response.Validation(w, map[string]string{"id": "Invalid plan id."})
		return
	}
	existing, err := plans.GetByID(r.Context(), s.pool, id)
	if err != nil {
		response.Err(w, http.StatusNotFound, "Plan not found.", "ERR_NOT_FOUND")
		return
	}
	var body planBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Validation(w, map[string]string{"body": "Invalid JSON."})
		return
	}
	body.PlanCode = existing.PlanCode
	in, errs := parsePlanBody(body)
	if len(errs) > 0 {
		response.Validation(w, errs)
		return
	}
	if err := plans.Update(r.Context(), s.pool, id, in); err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to update plan.", "ERR_INTERNAL")
		return
	}
	response.OK(w, map[string]any{"id": id}, "Plan updated.")
}
