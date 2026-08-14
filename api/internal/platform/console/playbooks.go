package console

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/inviteemail"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// Fixed CS playbook catalog — Day 0 → go-live → payroll.
var csPlaybookCatalog = []struct {
	Code  string `json:"code"`
	Title string `json:"title"`
	Hint  string `json:"hint"`
}{
	{Code: "day0_workspace", Title: "Day 0 — Workspace provisioned", Hint: "Tenant exists and owner can sign in."},
	{Code: "day0_admin_invite", Title: "Day 0 — Admin invited", Hint: "At least one active or pending admin user."},
	{Code: "week1_coa", Title: "Week 1 — Chart of accounts", Hint: "Foundation COA / finance defaults reviewed."},
	{Code: "week1_masters", Title: "Week 1 — Partners & items", Hint: "Customers/vendors and catalog seeded."},
	{Code: "week1_policies", Title: "Week 1 — Process policies", Hint: "GR/SO gates and attachment rules confirmed."},
	{Code: "golive_sell", Title: "Go-live — First sale path", Hint: "First confirmed sales document."},
	{Code: "golive_buy", Title: "Go-live — First receive/buy path", Hint: "First goods receipt or purchase invoice."},
	{Code: "golive_cash", Title: "Go-live — First cash document", Hint: "First official receipt or payment voucher."},
	{Code: "payroll_ess", Title: "Payroll — ESS user links", Hint: "Employees linked for ESS where needed."},
	{Code: "training_done", Title: "Training complete", Hint: "CS marks after owner walkthrough."},
}

func (s *service) ensurePlaybookRows(ctx context.Context, customerID int64) error {
	for _, step := range csPlaybookCatalog {
		_, err := s.pool.Exec(ctx, `
			insert into public.platform_cs_playbook_steps (platform_customer_id, step_code, status)
			values ($1, $2, 'pending')
			on conflict (platform_customer_id, step_code) do nothing`, customerID, step.Code)
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *service) autoCompletePlaybook(ctx context.Context, customerID int64, tenantID *int64) {
	if tenantID == nil {
		_ = s.markPlaybook(ctx, customerID, "day0_workspace", "pending", "")
		return
	}
	_ = s.markPlaybook(ctx, customerID, "day0_workspace", "auto", "Tenant linked")

	var admins int
	_ = s.pool.QueryRow(ctx, `
		select count(*) from public.users
		where tenant_id = $1 and status in ('active','invited')`, *tenantID).Scan(&admins)
	if admins > 0 {
		_ = s.markPlaybook(ctx, customerID, "day0_admin_invite", "auto", "Users present")
	}

	var accounts, partners, items int
	_ = s.pool.QueryRow(ctx, `select count(*) from public.fin_accounts where tenant_id = $1`, *tenantID).Scan(&accounts)
	_ = s.pool.QueryRow(ctx, `select count(*) from public.inv_partners where tenant_id = $1`, *tenantID).Scan(&partners)
	_ = s.pool.QueryRow(ctx, `select count(*) from public.inv_items where tenant_id = $1`, *tenantID).Scan(&items)
	if accounts > 5 {
		_ = s.markPlaybook(ctx, customerID, "week1_coa", "auto", "COA present")
	}
	if partners > 0 && items > 0 {
		_ = s.markPlaybook(ctx, customerID, "week1_masters", "auto", "Masters seeded")
	}

	var sales, gr, cash int
	_ = s.pool.QueryRow(ctx, `
		select count(*) from public.sa_sales where tenant_id = $1 and deleted_at is null`, *tenantID).Scan(&sales)
	_ = s.pool.QueryRow(ctx, `
		select count(*) from public.gr_goods_receipts where tenant_id = $1`, *tenantID).Scan(&gr)
	_ = s.pool.QueryRow(ctx, `
		select
		  (select count(*) from public.fin_official_receipts where tenant_id = $1 and deleted_at is null) +
		  (select count(*) from public.fin_payment_vouchers where tenant_id = $1 and deleted_at is null)`, *tenantID).Scan(&cash)
	if sales > 0 {
		_ = s.markPlaybook(ctx, customerID, "golive_sell", "auto", "Sales docs exist")
	}
	if gr > 0 {
		_ = s.markPlaybook(ctx, customerID, "golive_buy", "auto", "Goods receipts exist")
	}
	if cash > 0 {
		_ = s.markPlaybook(ctx, customerID, "golive_cash", "auto", "Cash docs exist")
	}

	var ess int
	_ = s.pool.QueryRow(ctx, `
		select count(*) from public.hr_employees
		where tenant_id = $1 and user_id is not null`, *tenantID).Scan(&ess)
	if ess > 0 {
		_ = s.markPlaybook(ctx, customerID, "payroll_ess", "auto", "ESS links present")
	}
}

func (s *service) markPlaybook(ctx context.Context, customerID int64, code, status, note string) error {
	_, err := s.pool.Exec(ctx, `
		update public.platform_cs_playbook_steps
		set status = $3,
		    notes = case when $4 <> '' then $4 else notes end,
		    completed_at = case when $3 in ('done','auto','skipped') then coalesce(completed_at, now()) else null end,
		    updated_at = now()
		where platform_customer_id = $1 and step_code = $2
		  and status = 'pending'`, customerID, code, status, note)
	return err
}

func (s *service) customerPlaybook(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	c, err := s.resolveCustomer(r.Context(), id)
	if err != nil {
		if err == pgx.ErrNoRows {
			response.Err(w, http.StatusNotFound, "Customer not found.", "ERR_NOT_FOUND")
			return
		}
		response.Err(w, http.StatusInternalServerError, "Failed to load customer.", "ERR_INTERNAL")
		return
	}
	if err := s.ensurePlaybookRows(r.Context(), c.CustomerID); err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to init playbook.", "ERR_INTERNAL")
		return
	}
	s.autoCompletePlaybook(r.Context(), c.CustomerID, c.TenantID)

	rows, err := s.pool.Query(r.Context(), `
		select step_code, status, notes, completed_at, updated_at
		from public.platform_cs_playbook_steps
		where platform_customer_id = $1`, c.CustomerID)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to load playbook.", "ERR_INTERNAL")
		return
	}
	defer rows.Close()
	byCode := map[string]map[string]any{}
	done := 0
	for rows.Next() {
		var code, status, notes string
		var completed, updated *time.Time
		if rows.Scan(&code, &status, &notes, &completed, &updated) != nil {
			continue
		}
		byCode[code] = map[string]any{
			"code": code, "status": status, "notes": notes,
			"completed_at": completed, "updated_at": updated,
		}
		if status == "done" || status == "auto" || status == "skipped" {
			done++
		}
	}

	steps := []map[string]any{}
	for _, cat := range csPlaybookCatalog {
		row := byCode[cat.Code]
		if row == nil {
			row = map[string]any{"code": cat.Code, "status": "pending", "notes": ""}
		}
		row["title"] = cat.Title
		row["hint"] = cat.Hint
		steps = append(steps, row)
	}
	pct := 0
	if len(csPlaybookCatalog) > 0 {
		pct = (done * 100) / len(csPlaybookCatalog)
	}
	response.OK(w, map[string]any{
		"customer_id": c.CustomerID,
		"percent":     pct,
		"done":        done,
		"total":       len(csPlaybookCatalog),
		"steps":       steps,
	}, "OK")
}

func (s *service) patchCustomerPlaybookStep(w http.ResponseWriter, r *http.Request) {
	tu, _ := auth.FromContext(r.Context())
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	code := strings.TrimSpace(chi.URLParam(r, "code"))
	var body struct {
		Status string `json:"status"`
		Notes  string `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Validation(w, map[string]string{"body": "Invalid JSON."})
		return
	}
	st := strings.TrimSpace(strings.ToLower(body.Status))
	if st != "pending" && st != "done" && st != "skipped" {
		response.Validation(w, map[string]string{"status": "Must be pending, done, or skipped."})
		return
	}
	c, err := s.resolveCustomer(r.Context(), id)
	if err != nil {
		response.Err(w, http.StatusNotFound, "Customer not found.", "ERR_NOT_FOUND")
		return
	}
	_ = s.ensurePlaybookRows(r.Context(), c.CustomerID)
	var completed any
	if st == "done" || st == "skipped" {
		completed = time.Now().UTC()
	}
	tag, err := s.pool.Exec(r.Context(), `
		update public.platform_cs_playbook_steps
		set status = $3, notes = coalesce(nullif($4,''), notes),
		    completed_at = $5,
		    completed_by_platform_user_id = $6,
		    updated_at = now()
		where platform_customer_id = $1 and step_code = $2`,
		c.CustomerID, code, st, strings.TrimSpace(body.Notes), completed, nullIfZero(tu.PlatformUserID))
	if err != nil || tag.RowsAffected() == 0 {
		response.Err(w, http.StatusNotFound, "Playbook step not found.", "ERR_NOT_FOUND")
		return
	}
	logPlatformAudit(r.Context(), s.pool, tu, platformAuditEntry{
		ActionCode: "platform.playbook.update", EventKind: "change",
		HTTPMethod: "PATCH", RoutePath: r.URL.Path,
		PlatformCustomerID: &c.CustomerID, TenantID: c.TenantID,
		TargetType: "platform_cs_playbook_steps", Summary: "Updated playbook " + code + " → " + st,
	})
	response.OK(w, map[string]any{"code": code, "status": st}, "Updated.")
}

func (s *service) resendTenantInvites(w http.ResponseWriter, r *http.Request) {
	tu, _ := auth.FromContext(r.Context())
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	c, err := s.resolveCustomer(r.Context(), id)
	if err != nil || c.TenantID == nil {
		response.Err(w, http.StatusNotFound, "Customer tenant not found.", "ERR_NOT_FOUND")
		return
	}
	tenantID := *c.TenantID
	tx, err := s.pool.Begin(r.Context())
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to refresh invites.", "ERR_INTERNAL")
		return
	}
	defer tx.Rollback(r.Context())

	_, err = tx.Exec(r.Context(), `
		update public.user_invites
		set invited_at = now(), revoked_at = null
		where tenant_id = $1 and accepted_at is null`, tenantID)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to refresh invites.", "ERR_INTERNAL")
		return
	}

	rows, err := tx.Query(r.Context(), `
		select ui.id, ui.user_id, ui.email, ui.full_name, ui.role_code
		from public.user_invites ui
		join public.users u on u.id = ui.user_id
		where ui.tenant_id = $1 and ui.accepted_at is null and ui.revoked_at is null
		  and u.status = 'invited'`, tenantID)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to list pending invites.", "ERR_INTERNAL")
		return
	}
	type pending struct {
		InviteID, UserID               int64
		Email, FullName, RoleCode string
	}
	var pendingList []pending
	for rows.Next() {
		var p pending
		if rows.Scan(&p.InviteID, &p.UserID, &p.Email, &p.FullName, &p.RoleCode) != nil {
			continue
		}
		pendingList = append(pendingList, p)
	}
	rows.Close()

	suffix := "platform-resend:" + strconv.FormatInt(time.Now().UnixNano(), 10)
	inviterID := tu.AppUserID
	for _, p := range pendingList {
		_ = inviteemail.EnqueueUserInviteTx(r.Context(), tx, s.pool, tenantID, inviterID, p.InviteID, p.UserID, p.Email, p.FullName, p.RoleCode, suffix)
	}
	if err := tx.Commit(r.Context()); err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to queue invite emails.", "ERR_INTERNAL")
		return
	}
	inviteemail.DrainUserInvitesAsync(s.pool)

	logPlatformAudit(r.Context(), s.pool, tu, platformAuditEntry{
		ActionCode: "platform.invite.resend", EventKind: "change",
		HTTPMethod: "POST", RoutePath: r.URL.Path,
		PlatformCustomerID: &c.CustomerID, TenantID: c.TenantID,
		TargetType: "user_invites", Summary: "Resent pending tenant invite emails",
	})
	msg := "Pending invites refreshed. Users sign in with Google using the invited email."
	if inviteemail.MailConfigured() && len(pendingList) > 0 {
		msg = "Pending invite emails re-queued. Users sign in with Google using the invited email."
	}
	response.OK(w, map[string]any{"refreshed": len(pendingList)}, msg)
}

func (s *service) quickFollowUp(w http.ResponseWriter, r *http.Request) {
	tu, _ := auth.FromContext(r.Context())
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	var body struct {
		Title    string `json:"title"`
		TaskType string `json:"task_type"`
		Notes    string `json:"notes"`
		SlaHours int    `json:"sla_hours"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Validation(w, map[string]string{"body": "Invalid JSON."})
		return
	}
	title := strings.TrimSpace(body.Title)
	if title == "" {
		title = "Check-in call"
	}
	tt := strings.TrimSpace(body.TaskType)
	if tt == "" {
		tt = "check_in"
	}
	sla := body.SlaHours
	if sla <= 0 {
		sla = 48
	}
	c, err := s.resolveCustomer(r.Context(), id)
	if err != nil {
		response.Err(w, http.StatusNotFound, "Customer not found.", "ERR_NOT_FOUND")
		return
	}
	due := time.Now().UTC().Add(time.Duration(sla) * time.Hour)
	var fid int64
	err = s.pool.QueryRow(r.Context(), `
		insert into public.platform_follow_up_tasks (
		  platform_customer_id, tenant_id, title, task_type, stage, due_at,
		  assigned_platform_user_id, created_by_platform_user_id, notes, sla_hours
		) values ($1,$2,$3,$4,'open',$5,$6,$6,$7,$8)
		returning id`,
		c.CustomerID, c.TenantID, title, tt, due,
		nullIfZero(tu.PlatformUserID), strings.TrimSpace(body.Notes), sla,
	).Scan(&fid)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to create follow-up.", "ERR_INTERNAL")
		return
	}
	response.OK(w, map[string]any{"id": fid, "due_at": due}, "Follow-up scheduled.")
}
