package supportaccess

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/customerregistry"
)

const (
	ModeReadOnly  = "read_only"
	ModeReadWrite = "read_write"

	DefaultTTL     = 60 * time.Minute
	ExtendTTL      = 30 * time.Minute
	HardCapFromStart = 90 * time.Minute

	EndedByUser   = "user"
	EndedByExpire = "expire"
	EndedByReplace = "replace"
)

type Session struct {
	ID                     int64
	PlatformUserID         *int64
	AuthUserID             string
	CustomerID             int64
	TenantID               int64
	GhostUserID            *int64
	CreatedGhost           bool
	AccessMode             string
	Reason                 string
	ExtendsUsed            int
	PreviousActiveTenantID *int64
	PreviousFullName       *string
	PreviousUserStatus     *string
	StartedAt              time.Time
	EndsAt                 time.Time
	EndedAt                *time.Time
	EndedBy                *string
	CompanyCode            string
	CompanyName            string
	SupportEmail           string
}

type StartInput struct {
	CustomerID     int64
	AuthUserID     string
	PlatformUserID int64
	Email          string
	AccessMode     string
	Reason         string
}

func NormalizeMode(raw string) string {
	switch strings.TrimSpace(strings.ToLower(raw)) {
	case ModeReadWrite:
		return ModeReadWrite
	default:
		return ModeReadOnly
	}
}

func OpenSessionForAuth(ctx context.Context, pool *pgxpool.Pool, authUserID string) (*Session, error) {
	s, err := scanSession(ctx, pool, `
		select s.id, s.platform_user_id, s.auth_user_id::text, s.customer_id, s.tenant_id, s.ghost_user_id,
		       s.created_ghost, s.access_mode, s.reason, s.extends_used, s.previous_active_tenant_id,
		       s.previous_full_name, s.previous_user_status, s.started_at, s.ends_at, s.ended_at, s.ended_by,
		       coalesce(t.company_code,''), coalesce(t.company_name,''), ''
		from public.platform_support_sessions s
		join public.tenants t on t.id = s.tenant_id
		where s.auth_user_id = $1::uuid and s.ended_at is null
		order by s.id desc limit 1`, authUserID)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	return s, err
}

func GetByID(ctx context.Context, pool *pgxpool.Pool, id int64) (*Session, error) {
	return scanSession(ctx, pool, `
		select s.id, s.platform_user_id, s.auth_user_id::text, s.customer_id, s.tenant_id, s.ghost_user_id,
		       s.created_ghost, s.access_mode, s.reason, s.extends_used, s.previous_active_tenant_id,
		       s.previous_full_name, s.previous_user_status, s.started_at, s.ends_at, s.ended_at, s.ended_by,
		       coalesce(t.company_code,''), coalesce(t.company_name,''), ''
		from public.platform_support_sessions s
		join public.tenants t on t.id = s.tenant_id
		where s.id = $1`, id)
}

func ListForCustomer(ctx context.Context, pool *pgxpool.Pool, customerID int64, limit int) ([]Session, error) {
	if limit <= 0 || limit > 50 {
		limit = 50
	}
	rows, err := pool.Query(ctx, `
		select s.id, s.platform_user_id, s.auth_user_id::text, s.customer_id, s.tenant_id, s.ghost_user_id,
		       s.created_ghost, s.access_mode, s.reason, s.extends_used, s.previous_active_tenant_id,
		       s.previous_full_name, s.previous_user_status, s.started_at, s.ends_at, s.ended_at, s.ended_by,
		       coalesce(t.company_code,''), coalesce(t.company_name,''), coalesce(pu.email, s.auth_user_id::text)
		from public.platform_support_sessions s
		join public.tenants t on t.id = s.tenant_id
		left join public.platform_users pu on pu.id = s.platform_user_id
		where s.customer_id = $1
		order by s.started_at desc
		limit $2`, customerID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Session
	for rows.Next() {
		var s Session
		if err := rows.Scan(
			&s.ID, &s.PlatformUserID, &s.AuthUserID, &s.CustomerID, &s.TenantID, &s.GhostUserID,
			&s.CreatedGhost, &s.AccessMode, &s.Reason, &s.ExtendsUsed, &s.PreviousActiveTenantID,
			&s.PreviousFullName, &s.PreviousUserStatus, &s.StartedAt, &s.EndsAt, &s.EndedAt, &s.EndedBy,
			&s.CompanyCode, &s.CompanyName, &s.SupportEmail,
		); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func scanSession(ctx context.Context, pool *pgxpool.Pool, q string, args ...any) (*Session, error) {
	var s Session
	err := pool.QueryRow(ctx, q, args...).Scan(
		&s.ID, &s.PlatformUserID, &s.AuthUserID, &s.CustomerID, &s.TenantID, &s.GhostUserID,
		&s.CreatedGhost, &s.AccessMode, &s.Reason, &s.ExtendsUsed, &s.PreviousActiveTenantID,
		&s.PreviousFullName, &s.PreviousUserStatus, &s.StartedAt, &s.EndsAt, &s.EndedAt, &s.EndedBy,
		&s.CompanyCode, &s.CompanyName, &s.SupportEmail,
	)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func IsExpired(s *Session, now time.Time) bool {
	if s == nil {
		return true
	}
	if s.EndedAt != nil {
		return true
	}
	return !now.Before(s.EndsAt)
}

func EndSession(ctx context.Context, pool *pgxpool.Pool, sessionID int64, endedBy string) error {
	s, err := GetByID(ctx, pool, sessionID)
	if err != nil {
		return err
	}
	if s.EndedAt != nil {
		return nil
	}
	now := time.Now()
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		update public.platform_support_sessions
		set ended_at = $2, ended_by = $3, updated_at = now()
		where id = $1 and ended_at is null`, sessionID, now, endedBy); err != nil {
		return err
	}

	if s.GhostUserID != nil && *s.GhostUserID > 0 {
		if s.CreatedGhost {
			_, err = tx.Exec(ctx, `
				update public.users
				set status = 'disabled', support_session_id = null, updated_at = now()
				where id = $1`, *s.GhostUserID)
		} else {
			name := ""
			if s.PreviousFullName != nil {
				name = *s.PreviousFullName
			}
			status := "active"
			if s.PreviousUserStatus != nil && *s.PreviousUserStatus != "" {
				status = *s.PreviousUserStatus
			}
			_, err = tx.Exec(ctx, `
				update public.users
				set full_name = coalesce(nullif($2, ''), full_name),
				    status = $3,
				    support_session_id = null,
				    updated_at = now()
				where id = $1`, *s.GhostUserID, name, status)
		}
		if err != nil {
			return err
		}
	}

	if s.PreviousActiveTenantID != nil && *s.PreviousActiveTenantID > 0 {
		var stillMember bool
		_ = tx.QueryRow(ctx, `
			select exists(
			  select 1 from public.users
			  where auth_user_id = $1::uuid and tenant_id = $2 and status = 'active' and support_session_id is null
			)`, s.AuthUserID, *s.PreviousActiveTenantID).Scan(&stillMember)
		if stillMember {
			_, _ = tx.Exec(ctx, `
				insert into public.user_active_tenant (auth_user_id, tenant_id, updated_at)
				values ($1::uuid, $2, now())
				on conflict (auth_user_id) do update
				set tenant_id = excluded.tenant_id, updated_at = now()`, s.AuthUserID, *s.PreviousActiveTenantID)
		} else {
			_, _ = tx.Exec(ctx, `delete from public.user_active_tenant where auth_user_id = $1::uuid`, s.AuthUserID)
		}
	} else {
		_, _ = tx.Exec(ctx, `delete from public.user_active_tenant where auth_user_id = $1::uuid`, s.AuthUserID)
	}

	return tx.Commit(ctx)
}

func ExtendSession(ctx context.Context, pool *pgxpool.Pool, sessionID int64) (*Session, error) {
	s, err := GetByID(ctx, pool, sessionID)
	if err != nil {
		return nil, err
	}
	if s.EndedAt != nil {
		return nil, fmt.Errorf("session already ended")
	}
	now := time.Now()
	if IsExpired(s, now) {
		_ = EndSession(ctx, pool, sessionID, EndedByExpire)
		return nil, fmt.Errorf("session expired")
	}
	if s.ExtendsUsed >= 1 {
		return nil, fmt.Errorf("extend already used")
	}
	hardCap := s.StartedAt.Add(HardCapFromStart)
	newEnds := now.Add(ExtendTTL)
	if newEnds.After(hardCap) {
		newEnds = hardCap
	}
	if !newEnds.After(s.EndsAt) {
		newEnds = s.EndsAt
	}
	_, err = pool.Exec(ctx, `
		update public.platform_support_sessions
		set ends_at = $2, extends_used = 1, updated_at = now()
		where id = $1 and ended_at is null`, sessionID, newEnds)
	if err != nil {
		return nil, err
	}
	return GetByID(ctx, pool, sessionID)
}

func Start(ctx context.Context, pool *pgxpool.Pool, in StartInput) (*Session, error) {
	reason := strings.TrimSpace(in.Reason)
	if len(reason) < 5 {
		return nil, fmt.Errorf("reason must be at least 5 characters")
	}
	mode := NormalizeMode(in.AccessMode)
	email := strings.ToLower(strings.TrimSpace(in.Email))
	if email == "" || in.AuthUserID == "" || in.CustomerID <= 0 {
		return nil, fmt.Errorf("invalid start input")
	}

	var tenantID int64
	var tenantStatus, companyCode, companyName string
	err := pool.QueryRow(ctx, `
		select pc.tenant_id, coalesce(t.status,''), coalesce(t.company_code,''), coalesce(t.company_name,'')
		from public.platform_customers pc
		left join public.tenants t on t.id = pc.tenant_id
		where pc.id = $1`, in.CustomerID).Scan(&tenantID, &tenantStatus, &companyCode, &companyName)
	if err != nil {
		return nil, err
	}
	if tenantID <= 0 {
		return nil, fmt.Errorf("customer has no workspace")
	}
	switch tenantStatus {
	case "active":
	default:
		return nil, fmt.Errorf("workspace status %s cannot be opened", tenantStatus)
	}

	if open, _ := OpenSessionForAuth(ctx, pool, in.AuthUserID); open != nil {
		if open.TenantID != tenantID {
			return nil, fmt.Errorf("end your current support session first")
		}
		// Same tenant already open — return existing if still valid.
		if !IsExpired(open, time.Now()) {
			return open, nil
		}
		_ = EndSession(ctx, pool, open.ID, EndedByExpire)
	}

	var prevActive *int64
	var prevTID int64
	err = pool.QueryRow(ctx, `select tenant_id from public.user_active_tenant where auth_user_id = $1::uuid`, in.AuthUserID).Scan(&prevTID)
	if err == nil && prevTID > 0 && prevTID != tenantID {
		prevActive = &prevTID
	} else if err != nil && err != pgx.ErrNoRows {
		return nil, err
	}

	displayName := fmt.Sprintf("Bluearm Support (%s)", email)
	now := time.Now()
	endsAt := now.Add(DefaultTTL)

	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	roleCode := resolveSupportRole(ctx, tx, tenantID)

	var platformUID *int64
	if in.PlatformUserID > 0 {
		pid := in.PlatformUserID
		platformUID = &pid
	}

	var sessionID int64
	err = tx.QueryRow(ctx, `
		insert into public.platform_support_sessions (
		  platform_user_id, auth_user_id, customer_id, tenant_id,
		  access_mode, reason, previous_active_tenant_id, started_at, ends_at
		) values ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9)
		returning id`,
		platformUID, in.AuthUserID, in.CustomerID, tenantID, mode, reason, prevActive, now, endsAt,
	).Scan(&sessionID)
	if err != nil {
		return nil, err
	}

	var existingID int64
	var existingName, existingStatus string
	err = tx.QueryRow(ctx, `
		select id, full_name, status from public.users
		where auth_user_id = $1::uuid and tenant_id = $2`, in.AuthUserID, tenantID).
		Scan(&existingID, &existingName, &existingStatus)

	var ghostID int64
	if err == nil && existingID > 0 {
		ghostID = existingID
		_, err = tx.Exec(ctx, `
			update public.users
			set status = 'active', full_name = $2, support_session_id = $3,
			    tenant_role = $4, updated_at = now()
			where id = $1`, existingID, displayName, sessionID, roleCode)
		if err != nil {
			return nil, err
		}
		_, _ = tx.Exec(ctx, `
			update public.platform_support_sessions
			set ghost_user_id = $2, created_ghost = false,
			    previous_full_name = $3, previous_user_status = $4, updated_at = now()
			where id = $1`, sessionID, ghostID, existingName, existingStatus)
	} else if err == pgx.ErrNoRows {
		err = tx.QueryRow(ctx, `
			insert into public.users (
			  tenant_id, auth_user_id, email, full_name, status, tenant_role, support_session_id
			) values ($1, $2::uuid, $3, $4, 'active', $5, $6)
			returning id`, tenantID, in.AuthUserID, email, displayName, roleCode, sessionID).Scan(&ghostID)
		if err != nil {
			// Email unique conflict: try alternate email local part.
			alt := strings.Replace(email, "@", "+support@", 1)
			err = tx.QueryRow(ctx, `
				insert into public.users (
				  tenant_id, auth_user_id, email, full_name, status, tenant_role, support_session_id
				) values ($1, $2::uuid, $3, $4, 'active', $5, $6)
				returning id`, tenantID, in.AuthUserID, alt, displayName, roleCode, sessionID).Scan(&ghostID)
			if err != nil {
				return nil, err
			}
		}
		_, err = tx.Exec(ctx, `
			update public.platform_support_sessions
			set ghost_user_id = $2, created_ghost = true, updated_at = now()
			where id = $1`, sessionID, ghostID)
		if err != nil {
			return nil, err
		}
	} else if err != nil {
		return nil, err
	}

	_, err = tx.Exec(ctx, `
		insert into public.user_active_tenant (auth_user_id, tenant_id, updated_at)
		values ($1::uuid, $2, now())
		on conflict (auth_user_id) do update
		set tenant_id = excluded.tenant_id, updated_at = now()`, in.AuthUserID, tenantID)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	_ = notifyOwner(ctx, pool, tenantID, sessionID, reason, endsAt, companyCode)
	customerregistry.AppendCRMLeadNote(ctx, pool, in.CustomerID,
		fmt.Sprintf("[support] Workspace opened (%s) until %s. Reason: %s", mode, endsAt.Format(time.RFC3339), reason))

	return GetByID(ctx, pool, sessionID)
}

func notifyOwner(ctx context.Context, pool *pgxpool.Pool, tenantID, sessionID int64, reason string, endsAt time.Time, companyCode string) error {
	var ownerID int64
	err := pool.QueryRow(ctx, `select coalesce(owner_user_id, 0) from public.tenants where id = $1`, tenantID).Scan(&ownerID)
	if err != nil || ownerID <= 0 {
		return err
	}
	title := "Bluearm support opened your workspace"
	body := fmt.Sprintf("Support is viewing %s. Reason: %s. Expected end: %s.",
		companyCode, reason, endsAt.Local().Format("15:04"))
	dedupe := fmt.Sprintf("support-open:%d:%d", tenantID, sessionID)
	_, err = pool.Exec(ctx, `
		insert into public.crm_notifications
		  (tenant_id, user_id, rule_id, severity, title, body, entity_type, entity_id, dedupe_key, actor_user_id, source)
		values ($1, $2, null, 'info', $3, $4, 'platform_support_session', $5, $6, null, 'system')
		on conflict (tenant_id, dedupe_key) do nothing`,
		tenantID, ownerID, title, body, sessionID, dedupe)
	return err
}

// MutationAllowed reports whether method/path may proceed for a support session.
func MutationAllowed(method, path, accessMode string) bool {
	m := strings.ToUpper(method)
	if m == httpMethodGet || m == httpMethodHead || m == httpMethodOptions {
		return true
	}
	p := strings.ToLower(path)
	if isSupportAllowlistedPath(p) {
		return true
	}
	if isDestructivePath(p) {
		return false
	}
	if accessMode == ModeReadOnly {
		return false
	}
	return true
}

const (
	httpMethodGet     = "GET"
	httpMethodHead    = "HEAD"
	httpMethodOptions = "OPTIONS"
)

func isSupportAllowlistedPath(p string) bool {
	allow := []string{
		"/api/v1/auth/me",
		"/api/v1/auth/session-ended",
		"/api/v1/presence/",
		"/api/v1/platform/console/support-sessions/",
	}
	for _, a := range allow {
		if p == a || strings.HasPrefix(p, a) {
			return true
		}
	}
	// extend/end nested under customers also allowlisted via support-sessions suffix checks
	if strings.Contains(p, "/support-sessions") {
		return true
	}
	return false
}

func isDestructivePath(p string) bool {
	deny := []string{
		"/wipe",
		"/suspend",
		"/platform/console/customers/", // delete customer is DELETE on this path — checked by method in middleware
	}
	for _, d := range deny {
		if strings.Contains(p, d) {
			// Allow GET on customers; destructive checked with method outside.
			if d == "/platform/console/customers/" {
				continue
			}
			return true
		}
	}
	if strings.Contains(p, "/user-management/") && (strings.Contains(p, "/delete") || strings.HasSuffix(p, "/wipe")) {
		return true
	}
	return false
}

func IsDestructiveRequest(method, path string) bool {
	p := strings.ToLower(path)
	m := strings.ToUpper(method)
	if strings.Contains(p, "/wipe") || strings.Contains(p, "/suspend") {
		return true
	}
	if m == "DELETE" && strings.Contains(p, "/platform/console/customers/") {
		return true
	}
	if m == "DELETE" && strings.Contains(p, "/user-management/users/") {
		return true
	}
	return isDestructivePath(p)
}

func resolveSupportRole(ctx context.Context, tx pgx.Tx, tenantID int64) string {
	var code string
	err := tx.QueryRow(ctx, `
		select role_code from public.tenant_roles
		where tenant_id = $1 and coalesce(is_active, true) = true
		  and role_code in ('admin', 'store_admin', 'owner')
		order by case role_code
		  when 'admin' then 0
		  when 'store_admin' then 1
		  else 2 end
		limit 1`, tenantID).Scan(&code)
	if err != nil || code == "" {
		return "store_admin"
	}
	return code
}

// PublicMap is the shape returned by /auth/me and console APIs.
func PublicMap(s *Session) map[string]any {
	if s == nil {
		return nil
	}
	m := map[string]any{
		"id":            s.ID,
		"tenant_id":     s.TenantID,
		"customer_id":   s.CustomerID,
		"company_code":  s.CompanyCode,
		"company_name":  s.CompanyName,
		"ends_at":       s.EndsAt.UTC().Format(time.RFC3339),
		"started_at":    s.StartedAt.UTC().Format(time.RFC3339),
		"access_mode":   s.AccessMode,
		"reason":        s.Reason,
		"extends_used":  s.ExtendsUsed,
		"can_extend":    s.ExtendsUsed < 1 && s.EndedAt == nil,
	}
	if s.EndedAt != nil {
		m["ended_at"] = s.EndedAt.UTC().Format(time.RFC3339)
	}
	if s.EndedBy != nil {
		m["ended_by"] = *s.EndedBy
	}
	if s.SupportEmail != "" {
		m["support_email"] = s.SupportEmail
	}
	return m
}
