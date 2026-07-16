package inventory

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type pgxpoolConn interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

func buildWhere(tenantID int64, p httputil.ListParams, nameCol, codeCol string) (string, []any) {
	where := "tenant_id = $1 and deleted_at is null"
	args := []any{tenantID}
	n := 2
	if p.Q != "" {
		where += fmt.Sprintf(" and (%s ilike $%d or %s ilike $%d)", nameCol, n, codeCol, n)
		args = append(args, "%"+p.Q+"%")
		n++
	}
	if p.Status == "active" || p.Status == "inactive" {
		where += fmt.Sprintf(" and status = $%d", n)
		args = append(args, p.Status)
	}
	return where, args
}

func orderSQL(order string) string {
	if order == "desc" {
		return "desc"
	}
	return "asc"
}

func boolOrFalse(v *bool) bool {
	return v != nil && *v
}

func createWithCode[T any](ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, entity string, insert func(context.Context, pgxpoolConn, string) (int64, T, error)) (int64, T, error) {
	var zero T
	const maxAttempts = 5
	for attempt := 0; attempt < maxAttempts; attempt++ {
		tx, err := pool.Begin(ctx)
		if err != nil {
			return 0, zero, err
		}
		var code string
		if err := tx.QueryRow(ctx, `select public.allocate_tenant_code($1, $2)`, tu.TenantID, entity).Scan(&code); err != nil {
			_ = tx.Rollback(ctx)
			return 0, zero, err
		}
		id, row, err := insert(ctx, tx, code)
		if err != nil {
			_ = tx.Rollback(ctx)
			if isUniqueViolation(err) && attempt+1 < maxAttempts {
				syncCodeSequence(ctx, pool, tu.TenantID, entity)
				continue
			}
			return 0, zero, err
		}
		if err := tx.Commit(ctx); err != nil {
			return 0, zero, err
		}
		return id, row, nil
	}
	return 0, zero, fmt.Errorf("could not allocate a unique %s code", entity)
}

func syncCodeSequence(ctx context.Context, pool *pgxpool.Pool, tenantID int64, entity string) {
	table, col := "", ""
	switch entity {
	case "partner":
		table, col = "inv_partners", "partner_code"
	case "location":
		table, col = "inv_locations", "location_code"
	case "project":
		table, col = "inv_projects", "project_code"
	case "department":
		table, col = "inv_departments", "department_code"
	case "item":
		table, col = "inv_items", "item_code"
	default:
		return
	}
	q := fmt.Sprintf(`
		insert into public.tenant_code_sequences (tenant_id, entity_type, last_value)
		select $1, $2, coalesce((
		  select max(nullif(regexp_replace(%s, '[^0-9]', '', 'g'), '')::int)
		  from public.%s where tenant_id = $1
		), 0)
		on conflict (tenant_id, entity_type) do update
		  set last_value = greatest(tenant_code_sequences.last_value, excluded.last_value)`, col, table)
	_, _ = pool.Exec(ctx, q, tenantID, entity)
}

func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "duplicate key") || strings.Contains(msg, "unique constraint") || strings.Contains(msg, "23505")
}

func softDeleteHandler(pool *pgxpool.Pool, table, action, targetType string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		q := fmt.Sprintf(`update public.%s set deleted_at = now(), updated_at = now() where id = $1 and tenant_id = $2 and deleted_at is null`, table)
		tag, err := pool.Exec(r.Context(), q, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, action, targetType, &id, nil, nil)
		response.OK(w, nil, "Deleted.")
	}
}
