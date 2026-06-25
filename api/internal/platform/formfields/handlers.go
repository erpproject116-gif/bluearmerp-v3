package formfields

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/customfields"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type FieldSetting struct {
	ID         *int64          `json:"id,omitempty"`
	FieldKey   string          `json:"field_key"`
	Kind       string          `json:"kind"`
	Label      string          `json:"label"`
	FieldType  string          `json:"field_type"`
	Options    json.RawMessage `json:"options,omitempty"`
	IsVisible  bool            `json:"is_visible"`
	IsRequired bool            `json:"is_required"`
	IsDisabled bool            `json:"is_disabled"`
	IsActive   bool            `json:"is_active"`
	SortOrder  int             `json:"sort_order"`
}

type patchBody struct {
	Fields []FieldSetting `json:"fields"`
}

func listSettingsHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		entityType := strings.TrimSpace(r.URL.Query().Get("entity_type"))
		if !ValidEntityType(entityType) {
			response.Validation(w, map[string]string{"entity_type": "Unknown entity type."})
			return
		}
		fields, err := LoadMergedSettings(r.Context(), pool, tu.TenantID, entityType)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load form settings.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"fields": fields, "can_manage": customfields.CanManage(tu)}, "OK")
	}
}

func patchSettingsHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		if !customfields.CanManage(tu) {
			response.Err(w, http.StatusForbidden, "Only admins can manage form settings.", "ERR_FORBIDDEN")
			return
		}
		var body patchBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if len(body.Fields) == 0 {
			response.Validation(w, map[string]string{"fields": "No fields to update."})
			return
		}
		entityType := strings.TrimSpace(r.URL.Query().Get("entity_type"))
		if !ValidEntityType(entityType) {
			response.Validation(w, map[string]string{"entity_type": "Unknown entity type."})
			return
		}
		if err := SaveSettings(r.Context(), pool, tu.TenantID, entityType, body.Fields); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save form settings.", "ERR_INTERNAL")
			return
		}
		fields, _ := LoadMergedSettings(r.Context(), pool, tu.TenantID, entityType)
		response.OK(w, map[string]any{"fields": fields}, "Updated.")
	}
}

func LoadMergedSettings(ctx context.Context, pool *pgxpool.Pool, tenantID int64, entityType string) ([]FieldSetting, error) {
	overrides, err := loadStandardOverrides(ctx, pool, tenantID, entityType)
	if err != nil {
		return nil, err
	}
	var out []FieldSetting
	for _, sf := range StandardFields(entityType) {
		o := overrides[sf.FieldKey]
		label := sf.Label
		isVisible := true
		isRequired := sf.DefaultRequired
		isDisabled := sf.DefaultDisabled
		sortOrder := sf.SortOrder
		if o != nil {
			if o.LabelOverride != nil && strings.TrimSpace(*o.LabelOverride) != "" {
				label = *o.LabelOverride
			}
			isVisible = o.IsVisible
			isRequired = o.IsRequired
			isDisabled = o.IsDisabled
			sortOrder = o.SortOrder
		}
		out = append(out, FieldSetting{
			FieldKey:   sf.FieldKey,
			Kind:       "standard",
			Label:      label,
			FieldType:  sf.FieldType,
			IsVisible:  isVisible,
			IsRequired: isRequired,
			IsDisabled: isDisabled,
			IsActive:   true,
			SortOrder:  sortOrder,
		})
	}
	customs, err := customfields.ListDefinitions(ctx, pool, tenantID, entityType, false)
	if err != nil {
		return nil, err
	}
	for _, c := range customs {
		id := c.ID
		out = append(out, FieldSetting{
			ID:         &id,
			FieldKey:   c.FieldKey,
			Kind:       "custom",
			Label:      c.Label,
			FieldType:  c.FieldType,
			Options:    c.Options,
			IsVisible:  customFieldVisible(c.Options, c.IsActive),
			IsRequired: c.IsRequired,
			IsDisabled: false,
			IsActive:   c.IsActive,
			SortOrder:  c.SortOrder + 1000,
		})
	}
	return out, nil
}

type standardOverride struct {
	LabelOverride *string
	IsVisible     bool
	IsRequired    bool
	IsDisabled    bool
	SortOrder     int
}

func loadStandardOverrides(ctx context.Context, pool *pgxpool.Pool, tenantID int64, entityType string) (map[string]*standardOverride, error) {
	rows, err := pool.Query(ctx, `
		select field_key, label_override, is_visible, is_required, is_disabled, sort_order
		from public.tenant_standard_field_settings
		where tenant_id = $1 and entity_type = $2`, tenantID, entityType)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]*standardOverride{}
	for rows.Next() {
		var o standardOverride
		var key string
		if err := rows.Scan(&key, &o.LabelOverride, &o.IsVisible, &o.IsRequired, &o.IsDisabled, &o.SortOrder); err != nil {
			return nil, err
		}
		out[key] = &o
	}
	return out, nil
}

func SaveSettings(ctx context.Context, pool *pgxpool.Pool, tenantID int64, entityType string, fields []FieldSetting) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	for _, f := range fields {
		switch f.Kind {
		case "standard":
			_, err := tx.Exec(ctx, `
				insert into public.tenant_standard_field_settings
				  (tenant_id, entity_type, field_key, label_override, is_visible, is_required, is_disabled, sort_order, updated_at)
				values ($1, $2, $3, $4, $5, $6, $7, $8, now())
				on conflict (tenant_id, entity_type, field_key)
				do update set
				  label_override = excluded.label_override,
				  is_visible = excluded.is_visible,
				  is_required = excluded.is_required,
				  is_disabled = excluded.is_disabled,
				  sort_order = excluded.sort_order,
				  updated_at = now()`,
				tenantID, entityType, f.FieldKey, nullIfEmpty(f.Label), f.IsVisible, f.IsRequired, f.IsDisabled, f.SortOrder)
			if err != nil {
				return err
			}
		case "custom":
			if f.ID == nil {
				continue
			}
			opts := mergeCustomFieldOptions(f.Options, f.IsVisible)
			_, err := tx.Exec(ctx, `
				update public.tenant_custom_field_definitions set
				  label = $1,
				  is_required = $2,
				  is_active = $3,
				  sort_order = $4,
				  options = $5,
				  updated_at = now()
				where id = $6 and tenant_id = $7 and entity_type = $8`,
				strings.TrimSpace(f.Label), f.IsRequired, f.IsActive, customSortOrder(f.SortOrder), opts,
				*f.ID, tenantID, entityType)
			if err != nil {
				return err
			}
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
