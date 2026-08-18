package customfields

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

var keyPattern = regexp.MustCompile(`^[a-z][a-z0-9_]{0,63}$`)

type Definition struct {
	ID         int64           `json:"id"`
	EntityType string          `json:"entity_type"`
	FieldKey   string          `json:"field_key"`
	Label      string          `json:"label"`
	FieldType  string          `json:"field_type"`
	Options    json.RawMessage `json:"options,omitempty"`
	IsRequired bool            `json:"is_required"`
	SortOrder  int             `json:"sort_order"`
	IsActive   bool            `json:"is_active"`
}

type definitionBody struct {
	EntityType string          `json:"entity_type"`
	FieldKey   string          `json:"field_key"`
	Label      string          `json:"label"`
	FieldType  string          `json:"field_type"`
	Options    json.RawMessage `json:"options"`
	IsRequired bool            `json:"is_required"`
	SortOrder  int             `json:"sort_order"`
}

var allowedTypes = map[string]bool{
	"text": true, "textarea": true, "number": true, "select": true, "radio": true,
	"checkbox": true, "date": true, "date_range": true, "number_range": true,
}

// Keep in sync with formfields/registry.go standardRegistry keys.
// Keep in sync with formfields/registry.go standardRegistry keys.
var formEntityTypes = map[string]bool{
	"inv_partner": true, "inv_location": true, "inv_project": true, "inv_department": true,
	"inv_item": true, "inv_repair_order": true,
	"quo_tax_type": true, "quo_currency": true, "quo_quotation": true,
	"sa_sales": true, "so_sales_order": true,
	"pr_purchase_request": true, "po_purchase_order": true, "gr_goods_receipt": true,
	"fin_official_receipt": true, "fin_supplier_invoice": true,
	"ops_work_item": true,
	"cms_page":      true,
}

type querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

func CanManage(tu auth.TenantUser) bool {
	return tu.CanManageFormSettings()
}

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/custom-fields", func(cr chi.Router) {
		cr.Get("/", listDefinitionsHandler(pool))
		cr.Post("/", createDefinitionHandler(pool))
		cr.Patch("/{id}", updateDefinitionHandler(pool))
		cr.Delete("/{id}", deleteDefinitionHandler(pool))
	})
}

func listDefinitionsHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		entityType := strings.TrimSpace(r.URL.Query().Get("entity_type"))
		if entityType == "" {
			response.Validation(w, map[string]string{"entity_type": "Entity type is required."})
			return
		}
		activeOnly := r.URL.Query().Get("active_only") != "false"
		defs, err := ListDefinitions(r.Context(), pool, tu.TenantID, entityType, activeOnly)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load custom fields.", "ERR_INTERNAL")
			return
		}
		response.OK(w, defs, "OK")
	}
}

func createDefinitionHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		if !CanManage(tu) {
			response.Err(w, http.StatusForbidden, "Only admins can manage custom fields.", "ERR_FORBIDDEN")
			return
		}
		var body definitionBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		entityType := strings.TrimSpace(body.EntityType)
		body.FieldKey = NormalizeFieldKey(body.Label, body.FieldKey)
		if errs := ValidateDefinitionInput(entityType, body.FieldKey, body.Label, body.FieldType, true); errs != nil {
			response.Validation(w, errs)
			return
		}
		opts := mergeDefinitionOptions(body.Options, true)
		label := strings.TrimSpace(body.Label)

		// Soft-deleted rows still occupy the unique (tenant, entity, field_key) slot.
		// Reactivate + update instead of failing with "already exists".
		var existingID int64
		var existingActive bool
		findErr := pool.QueryRow(r.Context(), `
			select id, is_active from public.tenant_custom_field_definitions
			where tenant_id = $1 and btrim(entity_type) = btrim($2::text) and field_key = $3`,
			tu.TenantID, entityType, body.FieldKey).Scan(&existingID, &existingActive)
		if findErr == nil && existingID > 0 {
			if existingActive {
				response.Validation(w, map[string]string{"field_key": "Field key already exists for this entity."})
				return
			}
			_, err := pool.Exec(r.Context(), `
				update public.tenant_custom_field_definitions set
				  label = $1, field_type = $2, options = $3, is_required = $4, sort_order = $5,
				  is_active = true, updated_at = now()
				where id = $6 and tenant_id = $7`,
				label, body.FieldType, opts, body.IsRequired, body.SortOrder, existingID, tu.TenantID)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to restore custom field.", "ERR_INTERNAL")
				return
			}
			def, readErr := getDefinition(r.Context(), pool, tu.TenantID, existingID)
			if readErr != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to restore custom field.", "ERR_INTERNAL")
				return
			}
			_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "settings.custom_field.create", "tenant_custom_field", &def.ID, nil, def)
			response.OK(w, def, "Restored.")
			return
		}

		var def Definition
		err := pool.QueryRow(r.Context(), `
			insert into public.tenant_custom_field_definitions
			  (tenant_id, entity_type, field_key, label, field_type, options, is_required, sort_order, is_active)
			values ($1, $2, $3, $4, $5, $6, $7, $8, true)
			returning id, entity_type, field_key, label, field_type, options, is_required, sort_order, is_active`,
			tu.TenantID, entityType, body.FieldKey, label,
			body.FieldType, opts, body.IsRequired, body.SortOrder).
			Scan(&def.ID, &def.EntityType, &def.FieldKey, &def.Label, &def.FieldType, &def.Options,
				&def.IsRequired, &def.SortOrder, &def.IsActive)
		if err != nil {
			if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
				response.Validation(w, map[string]string{"field_key": "Field key already exists for this entity."})
				return
			}
			if isSchemaError(err) {
				response.Err(w, http.StatusInternalServerError,
					"Custom field tables are missing. Apply migrations 004_custom_fields.sql and 027_custom_field_persistence.sql on the API database.",
					"ERR_SCHEMA")
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to create custom field.", "ERR_INTERNAL")
			return
		}
		if def.ID <= 0 {
			response.Err(w, http.StatusInternalServerError, "Custom field was not saved.", "ERR_INTERNAL")
			return
		}
		readBack, readErr := getDefinition(r.Context(), pool, tu.TenantID, def.ID)
		if readErr != nil || readBack.ID != def.ID {
			msg := "Custom field was created but could not be read back. Apply migrations 004_custom_fields.sql and 027_custom_field_persistence.sql, then restart the API."
			if readErr != nil && isSchemaError(readErr) {
				msg = "Custom field tables are missing. Apply migrations 004_custom_fields.sql and 027_custom_field_persistence.sql on the API database."
			}
			response.Err(w, http.StatusInternalServerError, msg, "ERR_SCHEMA")
			return
		}
		def = readBack
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "settings.custom_field.create", "tenant_custom_field", &def.ID, nil, def)
		response.OK(w, def, "Created.")
	}
}

func updateDefinitionHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		if !CanManage(tu) {
			response.Err(w, http.StatusForbidden, "Only admins can manage custom fields.", "ERR_FORBIDDEN")
			return
		}
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body struct {
			Label      *string          `json:"label"`
			FieldType  *string          `json:"field_type"`
			Options    *json.RawMessage `json:"options"`
			IsRequired *bool            `json:"is_required"`
			SortOrder  *int             `json:"sort_order"`
			IsActive   *bool            `json:"is_active"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		before, _ := getDefinition(r.Context(), pool, tu.TenantID, id)
		tag, err := pool.Exec(r.Context(), `
			update public.tenant_custom_field_definitions set
			  label = coalesce($1, label),
			  field_type = coalesce($2, field_type),
			  options = coalesce($3, options),
			  is_required = coalesce($4, is_required),
			  sort_order = coalesce($5, sort_order),
			  is_active = coalesce($6, is_active),
			  updated_at = now()
			where id = $7 and tenant_id = $8`,
			body.Label, body.FieldType, body.Options, body.IsRequired, body.SortOrder, body.IsActive, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Custom field not found.", "ERR_NOT_FOUND")
			return
		}
		def, _ := getDefinition(r.Context(), pool, tu.TenantID, id)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "settings.custom_field.update", "tenant_custom_field", &id, before, def)
		response.OK(w, def, "Updated.")
	}
}

func deleteDefinitionHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		if !CanManage(tu) {
			response.Err(w, http.StatusForbidden, "Only admins can manage custom fields.", "ERR_FORBIDDEN")
			return
		}
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		before, err := getDefinition(r.Context(), pool, tu.TenantID, id)
		if err != nil || before.ID == 0 {
			response.Err(w, http.StatusNotFound, "Custom field not found.", "ERR_NOT_FOUND")
			return
		}
		// Hard delete so Remove clears the field from settings and frees the field_key.
		_, _ = pool.Exec(r.Context(), `
			delete from public.tenant_custom_field_values
			where tenant_id = $1 and btrim(entity_type) = btrim($2::text) and field_key = $3`,
			tu.TenantID, before.EntityType, before.FieldKey)
		tag, err := pool.Exec(r.Context(), `
			delete from public.tenant_custom_field_definitions
			where id = $1 and tenant_id = $2`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusInternalServerError, "Failed to remove custom field.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "settings.custom_field.delete", "tenant_custom_field", &id, before, nil)
		response.OK(w, nil, "Deleted.")
	}
}

func getDefinition(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (Definition, error) {
	var d Definition
	err := pool.QueryRow(ctx, `
		select id, entity_type, field_key, label, field_type, options, is_required, sort_order, is_active
		from public.tenant_custom_field_definitions
		where id = $1 and tenant_id = $2`, id, tenantID).
		Scan(&d.ID, &d.EntityType, &d.FieldKey, &d.Label, &d.FieldType, &d.Options, &d.IsRequired, &d.SortOrder, &d.IsActive)
	return d, err
}

func ListDefinitions(ctx context.Context, conn querier, tenantID int64, entityType string, activeOnly bool) ([]Definition, error) {
	entityType = strings.TrimSpace(entityType)
	q := `
		select id, entity_type, field_key, label, field_type, options, is_required, sort_order, is_active
		from public.tenant_custom_field_definitions
		where tenant_id = $1 and btrim(entity_type) = btrim($2::text)`
	if activeOnly {
		q += ` and is_active = true`
	}
	q += ` order by sort_order, id`
	rows, err := conn.Query(ctx, q, tenantID, entityType)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Definition
	for rows.Next() {
		var d Definition
		if err := rows.Scan(&d.ID, &d.EntityType, &d.FieldKey, &d.Label, &d.FieldType, &d.Options, &d.IsRequired, &d.SortOrder, &d.IsActive); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	if out == nil {
		out = []Definition{}
	}
	return out, nil
}

func LoadValues(ctx context.Context, pool *pgxpool.Pool, tenantID int64, entityType string, entityID int64) (map[string]any, error) {
	rows, err := pool.Query(ctx, `
		select field_key, value_json
		from public.tenant_custom_field_values
		where tenant_id = $1 and entity_type = $2 and entity_id = $3`, tenantID, entityType, entityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]any{}
	for rows.Next() {
		var key string
		var raw []byte
		if err := rows.Scan(&key, &raw); err != nil {
			return nil, err
		}
		var v any
		if err := json.Unmarshal(raw, &v); err != nil {
			return nil, err
		}
		out[key] = v
	}
	return out, nil
}

func LoadValuesBatch(ctx context.Context, pool *pgxpool.Pool, tenantID int64, entityType string, entityIDs []int64) (map[int64]map[string]any, error) {
	out := map[int64]map[string]any{}
	if len(entityIDs) == 0 {
		return out, nil
	}
	rows, err := pool.Query(ctx, `
		select entity_id, field_key, value_json
		from public.tenant_custom_field_values
		where tenant_id = $1 and entity_type = $2 and entity_id = any($3::bigint[])`, tenantID, entityType, entityIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var entityID int64
		var key string
		var raw []byte
		if err := rows.Scan(&entityID, &key, &raw); err != nil {
			return nil, err
		}
		if out[entityID] == nil {
			out[entityID] = map[string]any{}
		}
		var v any
		if err := json.Unmarshal(raw, &v); err != nil {
			return nil, err
		}
		out[entityID][key] = v
	}
	return out, nil
}

// IsPersonalBirthdayField reports whether a custom field is personal birthday/DOB
// data (not part of selling documents such as Quotation).
func IsPersonalBirthdayField(fieldKey, label string) bool {
	key := strings.ToLower(strings.TrimSpace(fieldKey))
	lbl := strings.ToLower(strings.TrimSpace(label))
	hay := key + " " + lbl
	switch lbl {
	case "birthday", "birth day", "birthdate", "birth date", "date of birth", "dob":
		return true
	}
	if strings.Contains(hay, "birthday") || strings.Contains(hay, "birth day") ||
		strings.Contains(hay, "birthdate") || strings.Contains(hay, "birth date") ||
		strings.Contains(hay, "date of birth") {
		return true
	}
	if key == "dob" || strings.HasPrefix(key, "dob_") || strings.HasSuffix(key, "_dob") || strings.Contains(key, "_dob_") {
		return true
	}
	return false
}

func skipRequiredOnEntity(entityType string, d Definition) bool {
	// Quotation is a price offer — personal birthday/DOB must not gate save.
	if strings.TrimSpace(entityType) == "quo_quotation" && IsPersonalBirthdayField(d.FieldKey, d.Label) {
		return true
	}
	return false
}

func ValidateAndSave(ctx context.Context, conn pgx.Tx, tenantID int64, entityType string, entityID int64, values map[string]any) map[string]string {
	defs, err := ListDefinitions(ctx, conn, tenantID, entityType, true)
	if err != nil {
		return map[string]string{"custom_values": "Failed to load field definitions."}
	}
	if values == nil {
		values = map[string]any{}
	}
	errs := map[string]string{}
	defByKey := map[string]Definition{}
	for _, d := range defs {
		defByKey[d.FieldKey] = d
		val, ok := values[d.FieldKey]
		if d.IsRequired && (!ok || isEmpty(val)) && !skipRequiredOnEntity(entityType, d) {
			errs["custom_values."+d.FieldKey] = fmt.Sprintf("%s is required.", d.Label)
		}
	}
	for key, val := range values {
		if !keyPattern.MatchString(key) {
			errs["custom_values."+key] = "Invalid field key."
			continue
		}
		def, ok := defByKey[key]
		if !ok {
			continue
		}
		if isEmpty(val) {
			_, _ = conn.Exec(ctx, `
				delete from public.tenant_custom_field_values
				where tenant_id = $1 and entity_type = $2 and entity_id = $3 and field_key = $4`,
				tenantID, entityType, entityID, key)
			continue
		}
		normalized, err := normalizeValue(def, val)
		if err != nil {
			errs["custom_values."+key] = err.Error()
			continue
		}
		raw, _ := json.Marshal(normalized)
		_, err = conn.Exec(ctx, `
			insert into public.tenant_custom_field_values (tenant_id, entity_type, entity_id, field_key, value_json, updated_at)
			values ($1, $2, $3, $4, $5, now())
			on conflict (tenant_id, entity_type, entity_id, field_key)
			do update set value_json = excluded.value_json, updated_at = now()`,
			tenantID, entityType, entityID, key, raw)
		if err != nil {
			errs["custom_values."+key] = "Failed to save value."
		}
	}
	if len(errs) > 0 {
		return errs
	}
	return nil
}

func ValidFormEntityType(entityType string) bool {
	return formEntityTypes[strings.TrimSpace(entityType)]
}

func isSchemaError(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "does not exist") || strings.Contains(msg, "42p01")
}

func NormalizeFieldKey(label, fieldKey string) string {
	key := strings.TrimSpace(fieldKey)
	if key == "" {
		key = strings.ToLower(strings.TrimSpace(label))
		key = regexp.MustCompile(`[^a-z0-9]+`).ReplaceAllString(key, "_")
		key = strings.Trim(key, "_")
	}
	key = strings.ToLower(key)
	key = regexp.MustCompile(`[^a-z0-9_]+`).ReplaceAllString(key, "_")
	key = strings.Trim(key, "_")
	if key == "" {
		key = "field"
	}
	if !regexp.MustCompile(`^[a-z]`).MatchString(key) {
		key = "f_" + key
	}
	if len(key) > 64 {
		key = key[:64]
	}
	return key
}

func mergeDefinitionOptions(opts json.RawMessage, isVisible bool) json.RawMessage {
	var o map[string]any
	if len(opts) > 0 {
		_ = json.Unmarshal(opts, &o)
	}
	if o == nil {
		o = map[string]any{}
	}
	o["is_visible"] = isVisible
	raw, _ := json.Marshal(o)
	return raw
}

func ValidateDefinitionInput(entityType, fieldKey, label, fieldType string, create bool) map[string]string {
	errs := map[string]string{}
	entityType = strings.TrimSpace(entityType)
	if entityType == "" {
		errs["entity_type"] = "Entity type is required."
	} else if !ValidFormEntityType(entityType) {
		errs["entity_type"] = "Unknown entity type."
	}
	if create && !keyPattern.MatchString(fieldKey) {
		errs["field_key"] = "Use lowercase letters, numbers, underscores; start with a letter."
	}
	if strings.TrimSpace(label) == "" {
		errs["label"] = "Label is required."
	}
	if !allowedTypes[fieldType] {
		errs["field_type"] = "Unsupported field type."
	}
	if len(errs) > 0 {
		return errs
	}
	return nil
}

func isEmpty(v any) bool {
	if v == nil {
		return true
	}
	switch t := v.(type) {
	case string:
		return strings.TrimSpace(t) == ""
	case []any:
		return len(t) == 0
	case map[string]any:
		if len(t) == 0 {
			return true
		}
		for _, sub := range t {
			if !isEmpty(sub) {
				return false
			}
		}
		return true
	default:
		return false
	}
}

func normalizeValue(def Definition, val any) (any, error) {
	switch def.FieldType {
	case "text", "textarea", "date":
		s, ok := val.(string)
		if !ok {
			return nil, fmt.Errorf("Must be text.")
		}
		return strings.TrimSpace(s), nil
	case "number":
		switch n := val.(type) {
		case float64:
			return n, nil
		case json.Number:
			f, err := n.Float64()
			if err != nil {
				return nil, fmt.Errorf("Must be a number.")
			}
			return f, nil
		default:
			return nil, fmt.Errorf("Must be a number.")
		}
	case "select", "radio":
		s, ok := val.(string)
		if !ok {
			return nil, fmt.Errorf("Must be a single choice.")
		}
		return strings.TrimSpace(s), nil
	case "checkbox":
		switch t := val.(type) {
		case bool:
			return t, nil
		case []any:
			return t, nil
		default:
			return nil, fmt.Errorf("Must be boolean or list.")
		}
	case "date_range", "number_range":
		m, ok := val.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("Must be a range object.")
		}
		return m, nil
	default:
		return val, nil
	}
}
