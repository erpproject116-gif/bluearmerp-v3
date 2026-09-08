package console

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/customerregistry"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func (s *service) suspendCustomer(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		response.Validation(w, map[string]string{"id": "Invalid customer id."})
		return
	}
	tenantID, code, status, err := s.loadCustomerTenant(r.Context(), id)
	if err != nil {
		if err == pgx.ErrNoRows {
			response.Err(w, http.StatusNotFound, "Customer not found.", "ERR_NOT_FOUND")
			return
		}
		response.Err(w, http.StatusInternalServerError, "Failed to load customer.", "ERR_INTERNAL")
		return
	}
	if tenantID == 0 {
		response.Err(w, http.StatusBadRequest, "Customer has no workspace to suspend.", "ERR_BAD_REQUEST")
		return
	}
	if status != "active" {
		response.Err(w, http.StatusBadRequest, "Only active workspaces can be suspended (status="+status+").", "ERR_BAD_REQUEST")
		return
	}

	// Do not wrap best-effort subscription cancel in the same TX as the tenant update:
	// a failed secondary statement aborts the whole Postgres transaction.
	tag, err := s.pool.Exec(r.Context(), `
		update public.tenants set status = 'suspended', updated_at = now()
		where id = $1 and status = 'active'`, tenantID)
	if err != nil {
		log.Printf("console: suspend tenant %d: %v", tenantID, err)
		response.Err(w, http.StatusInternalServerError, "Failed to suspend workspace: "+err.Error(), "ERR_INTERNAL")
		return
	}
	if tag.RowsAffected() == 0 {
		response.Err(w, http.StatusConflict, "Workspace is no longer active.", "ERR_CONFLICT")
		return
	}
	if _, err := s.pool.Exec(r.Context(), `
		update public.platform_subscriptions
		set status = 'cancelled', updated_at = now(),
		    notes = coalesce(notes,'') || E'\n[suspend] Access suspended by platform; data retained.'
		where customer_id = $1 and status in ('active','trialing','past_due','pending')`, id); err != nil {
		log.Printf("console: suspend customer %d cancel subscriptions (best-effort): %v", id, err)
	}

	customerregistry.AppendCRMLeadNote(r.Context(), s.pool, id, "[lifecycle] Workspace suspended — ERP access removed; business data kept.")
	tu, _ := auth.FromContext(r.Context())
	tid := tenantID
	logPlatformAudit(r.Context(), s.pool, tu, platformAuditEntry{
		ActionCode: "platform.customer.suspend", EventKind: "change",
		HTTPMethod: "POST", RoutePath: r.URL.Path,
		PlatformCustomerID: &id, TenantID: &tid,
		TargetType: "tenants", TargetID: &tid,
		Summary: "Suspended workspace " + code + " (data retained)",
	})
	response.OK(w, map[string]any{"tenant_id": tenantID, "company_code": code, "status": "suspended"}, "Workspace suspended. Business data retained.")
}

func (s *service) reactivateCustomer(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		response.Validation(w, map[string]string{"id": "Invalid customer id."})
		return
	}
	tenantID, code, status, err := s.loadCustomerTenant(r.Context(), id)
	if err != nil {
		if err == pgx.ErrNoRows {
			response.Err(w, http.StatusNotFound, "Customer not found.", "ERR_NOT_FOUND")
			return
		}
		response.Err(w, http.StatusInternalServerError, "Failed to load customer.", "ERR_INTERNAL")
		return
	}
	if tenantID == 0 {
		response.Err(w, http.StatusBadRequest, "Customer has no workspace to reactivate.", "ERR_BAD_REQUEST")
		return
	}
	if status != "suspended" {
		response.Err(w, http.StatusBadRequest, "Only suspended workspaces can be reactivated (status="+status+").", "ERR_BAD_REQUEST")
		return
	}
	tag, err := s.pool.Exec(r.Context(), `
		update public.tenants set status = 'active', updated_at = now()
		where id = $1 and status = 'suspended'`, tenantID)
	if err != nil {
		log.Printf("console: reactivate tenant %d: %v", tenantID, err)
		response.Err(w, http.StatusInternalServerError, "Failed to reactivate workspace: "+err.Error(), "ERR_INTERNAL")
		return
	}
	if tag.RowsAffected() == 0 {
		response.Err(w, http.StatusConflict, "Workspace is no longer suspended.", "ERR_CONFLICT")
		return
	}
	customerregistry.AppendCRMLeadNote(r.Context(), s.pool, id, "[lifecycle] Workspace reactivated — same tenant and business data.")
	tu, _ := auth.FromContext(r.Context())
	tid := tenantID
	logPlatformAudit(r.Context(), s.pool, tu, platformAuditEntry{
		ActionCode: "platform.customer.reactivate", EventKind: "change",
		HTTPMethod: "POST", RoutePath: r.URL.Path,
		PlatformCustomerID: &id, TenantID: &tid,
		TargetType: "tenants", TargetID: &tid,
		Summary: "Reactivated workspace " + code,
	})
	response.OK(w, map[string]any{"tenant_id": tenantID, "company_code": code, "status": "active"}, "Workspace reactivated.")
}

func (s *service) wipePreflightCustomer(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		response.Validation(w, map[string]string{"id": "Invalid customer id."})
		return
	}
	tenantID, code, status, err := s.loadCustomerTenant(r.Context(), id)
	if err != nil {
		if err == pgx.ErrNoRows {
			response.Err(w, http.StatusNotFound, "Customer not found.", "ERR_NOT_FOUND")
			return
		}
		response.Err(w, http.StatusInternalServerError, "Failed to load customer.", "ERR_INTERNAL")
		return
	}
	if tenantID == 0 {
		response.Err(w, http.StatusBadRequest, "Customer has no workspace to wipe.", "ERR_BAD_REQUEST")
		return
	}
	blockers, err := s.tenantWipeBlockers(r.Context())
	if err != nil {
		log.Printf("console: wipe preflight customer %d: %v", id, err)
		// Still open the dialog — surface catalog failure as a soft blocker instead of HTTP 500.
		response.OK(w, map[string]any{
			"tenant_id":     tenantID,
			"company_code":  code,
			"tenant_status": status,
			"can_wipe":      false,
			"blockers":      []string{"Wipe preflight catalog check failed: " + err.Error()},
			"irreversible":  true,
			"customer_kept": true,
		}, "OK")
		return
	}
	response.OK(w, map[string]any{
		"tenant_id":     tenantID,
		"company_code":  code,
		"tenant_status": status,
		"can_wipe":      len(blockers) == 0,
		"blockers":      blockers,
		"irreversible":  true,
		"customer_kept": true,
	}, "OK")
}

func (s *service) wipeCustomer(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		response.Validation(w, map[string]string{"id": "Invalid customer id."})
		return
	}
	var body struct {
		ConfirmCompanyCode      string `json:"confirm_company_code"`
		AcknowledgeIrreversible bool   `json:"acknowledge_irreversible"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Err(w, http.StatusBadRequest, "Invalid JSON body.", "ERR_BAD_REQUEST")
		return
	}
	if !body.AcknowledgeIrreversible {
		response.Validation(w, map[string]string{"acknowledge_irreversible": "Confirm that wipe is irreversible."})
		return
	}

	tenantID, code, status, err := s.loadCustomerTenant(r.Context(), id)
	if err != nil {
		if err == pgx.ErrNoRows {
			response.Err(w, http.StatusNotFound, "Customer not found.", "ERR_NOT_FOUND")
			return
		}
		response.Err(w, http.StatusInternalServerError, "Failed to load customer.", "ERR_INTERNAL")
		return
	}
	if tenantID == 0 {
		response.Err(w, http.StatusBadRequest, "Customer has no workspace to wipe.", "ERR_BAD_REQUEST")
		return
	}
	if status != "active" && status != "suspended" {
		response.Err(w, http.StatusBadRequest, "Only active or suspended workspaces can be wiped (status="+status+").", "ERR_BAD_REQUEST")
		return
	}
	if strings.TrimSpace(body.ConfirmCompanyCode) != code {
		response.Validation(w, map[string]string{"confirm_company_code": "Type the exact company code to confirm wipe."})
		return
	}

	blockers, err := s.tenantWipeBlockers(r.Context())
	if err != nil {
		log.Printf("console: wipe blockers customer %d: %v", id, err)
		// Catalog check failed — proceed; DELETE will surface real FK violations.
		blockers = nil
	}
	if len(blockers) > 0 {
		response.Err(w, http.StatusConflict,
			"Wipe blocked: tenant FKs without ON DELETE CASCADE ("+strings.Join(blockers, "; ")+").",
			"ERR_WIPE_BLOCKED")
		return
	}

	tx, err := s.pool.Begin(r.Context())
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to wipe workspace.", "ERR_INTERNAL")
		return
	}
	defer tx.Rollback(r.Context())

	if _, err := tx.Exec(r.Context(), `
		update public.platform_subscriptions
		set status = 'cancelled', updated_at = now(),
		    notes = coalesce(notes,'') || E'\n[wipe] Workspace wiped; tenant deleted.'
		where customer_id = $1`, id); err != nil {
		log.Printf("console: wipe cancel subscriptions customer %d: %v", id, err)
		response.Err(w, http.StatusInternalServerError, "Failed to cancel subscriptions: "+err.Error(), "ERR_INTERNAL")
		return
	}
	if _, err := tx.Exec(r.Context(), `
		update public.platform_customers set tenant_id = null, updated_at = now() where id = $1`, id); err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to unlink customer.", "ERR_INTERNAL")
		return
	}
	// Break users ↔ tenant_roles composite FK race before tenants CASCADE deletes both.
	if _, err := tx.Exec(r.Context(), `delete from public.users where tenant_id = $1`, tenantID); err != nil {
		log.Printf("console: wipe delete users tenant %d: %v", tenantID, err)
		response.Err(w, http.StatusInternalServerError, "Failed to delete workspace users: "+err.Error(), "ERR_INTERNAL")
		return
	}
	tag, err := tx.Exec(r.Context(), `delete from public.tenants where id = $1`, tenantID)
	if err != nil {
		// #region agent log
		diag := ""
		if rows, qerr := s.pool.Query(r.Context(), `
			select c.conname || ' → ' || ref.relname || ' [' ||
			  case c.confdeltype when 'a' then 'NO ACTION' when 'r' then 'RESTRICT'
			    when 'c' then 'CASCADE' when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT'
			    else c.confdeltype::text end || '] ' || pg_get_constraintdef(c.oid)
			from pg_catalog.pg_constraint c
			join pg_catalog.pg_class cl on cl.oid = c.conrelid
			join pg_catalog.pg_class ref on ref.oid = c.confrelid
			where c.contype = 'f' and cl.relname = 'so_sales_order_release_lines'
			order by c.conname`); qerr == nil {
			defer rows.Close()
			var parts []string
			for rows.Next() {
				var line string
				if rows.Scan(&line) == nil {
					parts = append(parts, line)
				}
			}
			diag = strings.Join(parts, " || ")
			log.Printf("console: wipe cascade FK diag tenant %d: %s; err=%v", tenantID, diag, err)
		}
		// #endregion
		msg := "Failed to delete workspace (cascade): " + err.Error()
		if diag != "" {
			msg += " | release_lines_fks: " + diag
		}
		response.Err(w, http.StatusInternalServerError, msg, "ERR_INTERNAL")
		return
	}
	if tag.RowsAffected() == 0 {
		response.Err(w, http.StatusNotFound, "Workspace already gone.", "ERR_NOT_FOUND")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to wipe workspace.", "ERR_INTERNAL")
		return
	}

	customerregistry.AppendCRMLeadNote(r.Context(), s.pool, id,
		"[lifecycle] Workspace wiped ("+code+") at "+time.Now().UTC().Format(time.RFC3339)+". Business data deleted. Customer lead kept for re-provision.")
	tu, _ := auth.FromContext(r.Context())
	tid := tenantID
	logPlatformAudit(r.Context(), s.pool, tu, platformAuditEntry{
		ActionCode: "platform.customer.wipe", EventKind: "change",
		HTTPMethod: "POST", RoutePath: r.URL.Path,
		PlatformCustomerID: &id, TenantID: &tid,
		TargetType: "tenants", TargetID: &tid,
		Summary: "Wiped workspace " + code + " (business data deleted)",
	})
	response.OK(w, map[string]any{
		"wiped": true, "previous_tenant_id": tenantID, "previous_company_code": code,
	}, "Workspace wiped. Provision again to create a new empty company.")
}

func (s *service) loadCustomerTenant(ctx context.Context, customerID int64) (tenantID int64, companyCode, status string, err error) {
	var tid *int64
	err = s.pool.QueryRow(ctx, `
		select pc.tenant_id, coalesce(t.company_code,''), coalesce(t.status,'')
		from public.platform_customers pc
		left join public.tenants t on t.id = pc.tenant_id
		where pc.id = $1`, customerID).Scan(&tid, &companyCode, &status)
	if err != nil {
		return 0, "", "", err
	}
	if tid != nil {
		tenantID = *tid
	}
	return tenantID, companyCode, status, nil
}

// tenantWipeBlockers lists FK constraints that would block DELETE tenants:
// 1) tenant_id → tenants without CASCADE/SET NULL
// 2) any column → users without CASCADE/SET NULL (users cascade from tenants)
// 3) any FK → other tenant-scoped masters without CASCADE/SET NULL
// Composite FKs are reported once (constraint name), not once per column.
func (s *service) tenantWipeBlockers(ctx context.Context) ([]string, error) {
	rows, err := s.pool.Query(ctx, `
		select format('%I.%I.%I → %s (ON DELETE %s)', n.nspname, cl.relname, c.conname, ref.relname,
		  case c.confdeltype
		    when 'a' then 'NO ACTION'
		    when 'r' then 'RESTRICT'
		    else c.confdeltype::text
		  end)
		from pg_catalog.pg_constraint c
		join pg_catalog.pg_class cl on cl.oid = c.conrelid
		join pg_catalog.pg_namespace n on n.oid = cl.relnamespace
		join pg_catalog.pg_class ref on ref.oid = c.confrelid
		join pg_catalog.pg_namespace rn on rn.oid = ref.relnamespace
		where c.contype = 'f'
		  and rn.nspname = 'public'
		  and n.nspname = 'public'
		  and c.confdeltype in ('a', 'r')
		  -- Wipe deletes users before the tenant; users→tenant_roles is handled there.
		  and not (cl.relname = 'users' and ref.relname = 'tenant_roles')
		  and (
		    (
		      ref.relname = 'tenants'
		      and exists (
		        select 1
		        from unnest(c.conkey) as u(attnum)
		        join pg_catalog.pg_attribute a
		          on a.attrelid = c.conrelid and a.attnum = u.attnum and not a.attisdropped
		        where a.attname = 'tenant_id'
		      )
		    )
		    or ref.relname = 'users'
		    or (
		      ref.relname not in ('tenants', 'users')
		      and exists (
		        select 1
		        from pg_catalog.pg_constraint tc
		        join pg_catalog.pg_attribute ta
		          on ta.attrelid = tc.conrelid and ta.attnum = any (tc.conkey) and not ta.attisdropped
		        where tc.contype = 'f'
		          and tc.conrelid = ref.oid
		          and ta.attname = 'tenant_id'
		          and tc.confrelid = 'public.tenants'::regclass
		          and tc.confdeltype = 'c'
		      )
		    )
		  )
		order by 1`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]string, 0)
	for rows.Next() {
		var label string
		if err := rows.Scan(&label); err != nil {
			return nil, err
		}
		out = append(out, label)
	}
	return out, rows.Err()
}
