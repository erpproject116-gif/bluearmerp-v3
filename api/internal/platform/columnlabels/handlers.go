package columnlabels

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/customfields"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type ColumnSetting struct {
	ColumnKey string `json:"column_key"`
	Label     string `json:"label"`
	SortOrder int    `json:"sort_order"`
}

type patchBody struct {
	Columns []ColumnSetting `json:"columns"`
}

func listHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		viewKey := strings.TrimSpace(r.URL.Query().Get("view_key"))
		if !ValidViewKey(viewKey) {
			response.Validation(w, map[string]string{"view_key": "Unknown view key."})
			return
		}
		cols, err := LoadMerged(r.Context(), pool, tu.TenantID, viewKey)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load column labels.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"columns": cols, "can_manage": customfields.CanManage(tu)}, "OK")
	}
}

func patchHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		if !customfields.CanManage(tu) {
			response.Err(w, http.StatusForbidden, "Only admins can manage column labels.", "ERR_FORBIDDEN")
			return
		}
		viewKey := strings.TrimSpace(r.URL.Query().Get("view_key"))
		if !ValidViewKey(viewKey) {
			response.Validation(w, map[string]string{"view_key": "Unknown view key."})
			return
		}
		var body patchBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if len(body.Columns) == 0 {
			response.Validation(w, map[string]string{"columns": "No columns to update."})
			return
		}
		if err := SaveOverrides(r.Context(), pool, tu.TenantID, viewKey, body.Columns); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save column labels.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "settings.column_labels.update", "column_label_settings", nil, nil, map[string]any{
			"view_key": viewKey, "column_count": len(body.Columns),
		})
		cols, _ := LoadMerged(r.Context(), pool, tu.TenantID, viewKey)
		response.OK(w, map[string]any{"columns": cols}, "Updated.")
	}
}

func LoadMerged(ctx context.Context, pool *pgxpool.Pool, tenantID int64, viewKey string) ([]ColumnSetting, error) {
	overrides, err := loadOverrides(ctx, pool, tenantID, viewKey)
	if err != nil {
		return nil, err
	}
	var out []ColumnSetting
	for _, sc := range StandardColumns(viewKey) {
		label := sc.Label
		if o, ok := overrides[sc.ColumnKey]; ok && strings.TrimSpace(o) != "" {
			label = o
		}
		out = append(out, ColumnSetting{
			ColumnKey: sc.ColumnKey,
			Label:     label,
			SortOrder: sc.SortOrder,
		})
	}
	return out, nil
}

func loadOverrides(ctx context.Context, pool *pgxpool.Pool, tenantID int64, viewKey string) (map[string]string, error) {
	rows, err := pool.Query(ctx, `
		select column_key, label_override
		from public.tenant_column_label_settings
		where tenant_id = $1 and view_key = $2`, tenantID, viewKey)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var key string
		var label *string
		if err := rows.Scan(&key, &label); err != nil {
			return nil, err
		}
		if label != nil {
			out[key] = *label
		}
	}
	return out, nil
}

func SaveOverrides(ctx context.Context, pool *pgxpool.Pool, tenantID int64, viewKey string, cols []ColumnSetting) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	allowed := map[string]bool{}
	for _, sc := range StandardColumns(viewKey) {
		allowed[sc.ColumnKey] = true
	}
	for _, c := range cols {
		if !allowed[c.ColumnKey] {
			continue
		}
		_, err := tx.Exec(ctx, `
			insert into public.tenant_column_label_settings
			  (tenant_id, view_key, column_key, label_override, updated_at)
			values ($1, $2, $3, $4, now())
			on conflict (tenant_id, view_key, column_key)
			do update set label_override = excluded.label_override, updated_at = now()`,
			tenantID, viewKey, c.ColumnKey, nullIfEmpty(c.Label))
		if err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func nullIfEmpty(s string) *string {
	t := strings.TrimSpace(s)
	if t == "" {
		return nil
	}
	return &t
}
