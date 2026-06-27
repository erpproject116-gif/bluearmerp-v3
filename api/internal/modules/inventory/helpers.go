package inventory

import (
	"context"
	"fmt"
	"net/http"
	"strconv"

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
	tx, err := pool.Begin(ctx)
	if err != nil {
		return 0, zero, err
	}
	defer tx.Rollback(ctx)
	var code string
	if err := tx.QueryRow(ctx, `select public.allocate_tenant_code($1, $2)`, tu.TenantID, entity).Scan(&code); err != nil {
		return 0, zero, err
	}
	id, row, err := insert(ctx, tx, code)
	if err != nil {
		return 0, zero, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, zero, err
	}
	return id, row, nil
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
