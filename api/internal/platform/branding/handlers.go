package branding

import (
	"context"
	"encoding/json"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/branding", func(br chi.Router) {
		br.Get("/", getBranding(pool))
		br.Put("/", putBranding(pool))
		br.Post("/logo", uploadCompanyLogo(pool))
		br.Get("/assets/{assetId}", downloadAsset(pool))
		br.Delete("/assets/{assetId}", deleteAsset(pool))
	})
	r.Post("/users/me/avatar", uploadUserAvatar(pool))
}

func requireManageBranding(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		if !tu.CanManageBranding() {
			response.Err(w, http.StatusForbidden, "Only store admins, owners, and superadmins can manage branding.", "ERR_FORBIDDEN")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func getBranding(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		settings, _, err := loadMergedSettings(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load branding.", "ERR_INTERNAL")
			return
		}
		// Do not wipe logo_asset_id when the file is missing (ephemeral disks).
		// Keep the ID so a re-upload or durable restore can recover; warn the client.
		logoMissing := logoAssetFileMissing(r.Context(), pool, tu.TenantID, settings)
		msg := "OK"
		if logoMissing {
			msg = "Logo file is missing on the server — please re-upload your company logo."
		}
		response.OK(w, map[string]any{
			"settings":     settings,
			"can_manage":   tu.CanManageBranding(),
			"logo_url":     logoURLFromSettings(settings),
			"logo_missing": logoMissing,
		}, msg)
	}
}

func putBranding(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		if !tu.CanManageBranding() {
			response.Err(w, http.StatusForbidden, "Only store admins, owners, and superadmins can manage branding.", "ERR_FORBIDDEN")
			return
		}
		var patch json.RawMessage
		if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		merged, err := mergeSettingsPatch(r.Context(), pool, tu.TenantID, patch)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save branding.", "ERR_INTERNAL")
			return
		}
		_, err = pool.Exec(r.Context(), `
			insert into public.tenant_branding (tenant_id, settings, updated_by_user_id)
			values ($1, $2, $3)
			on conflict (tenant_id) do update set
			  settings = excluded.settings,
			  updated_by_user_id = excluded.updated_by_user_id,
			  updated_at = now()`, tu.TenantID, merged, tu.AppUserID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save branding.", "ERR_INTERNAL")
			return
		}
		syncTenantTinFromBranding(r.Context(), pool, tu.TenantID, merged)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "branding.update", "tenant_branding", &tu.TenantID, nil, nil)
		var out map[string]any
		_ = json.Unmarshal(merged, &out)
		response.OK(w, map[string]any{"settings": out}, "Saved.")
	}
}

func deepMergeJSON(base []byte, patch json.RawMessage) []byte {
	var baseMap map[string]any
	_ = json.Unmarshal(base, &baseMap)
	var patchMap map[string]any
	_ = json.Unmarshal(patch, &patchMap)
	merged := deepMergeMaps(baseMap, patchMap)
	out, _ := json.Marshal(merged)
	return out
}

func deepMergeMaps(base, patch map[string]any) map[string]any {
	if base == nil {
		base = map[string]any{}
	}
	for k, pv := range patch {
		bv, ok := base[k]
		if !ok {
			base[k] = pv
			continue
		}
		pMap, pOk := pv.(map[string]any)
		bMap, bOk := bv.(map[string]any)
		if pOk && bOk {
			base[k] = deepMergeMaps(bMap, pMap)
			continue
		}
		base[k] = pv
	}
	return base
}

func setIfEmpty(m map[string]any, key string, val *string) {
	if val == nil || strings.TrimSpace(*val) == "" {
		return
	}
	cur, _ := m[key].(string)
	if strings.TrimSpace(cur) == "" {
		m[key] = strings.TrimSpace(*val)
	}
}

func logoURLFromSettings(settings map[string]any) string {
	receipt, _ := settings["receipt"].(map[string]any)
	if receipt == nil {
		return ""
	}
	switch v := receipt["logo_asset_id"].(type) {
	case float64:
		if v > 0 {
			return assetInlineURL(int64(v))
		}
	}
	return ""
}

func storeAsset(ctx context.Context, pool *pgxpool.Pool, tenantID, userID, uploadedBy int64, kind, fileName, mime, storagePath string, size int64) (int64, error) {
	var id int64
	err := pool.QueryRow(ctx, `
		insert into public.tenant_branding_assets (
		  tenant_id, asset_kind, user_id, file_name, mime_type, size_bytes, storage_path, uploaded_by_user_id
		) values ($1, $2, $3, $4, $5, $6, $7, $8)
		returning id`,
		tenantID, kind, nullableUserID(kind, userID), fileName, mime, size, storagePath, uploadedBy,
	).Scan(&id)
	return id, err
}

func nullableUserID(kind string, userID int64) *int64 {
	if kind == "user_avatar" && userID > 0 {
		return &userID
	}
	return nil
}

func absStoragePath(rel string) string {
	return filepath.Join(uploadDir(), filepath.FromSlash(rel))
}

func assetInlineURL(id int64) string {
	return "/api/v1/branding/assets/" + strconv.FormatInt(id, 10) + "?inline=1"
}

func ResolveAvatarRef(ref string) string {
	ref = strings.TrimSpace(ref)
	if strings.HasPrefix(ref, "branding-asset:") {
		id := strings.TrimPrefix(ref, "branding-asset:")
		if id != "" {
			return assetInlineURL(parseID(id))
		}
	}
	return ref
}

func parseID(s string) int64 {
	n, _ := strconv.ParseInt(s, 10, 64)
	return n
}

func syncTenantTinFromBranding(ctx context.Context, pool *pgxpool.Pool, tenantID int64, settingsJSON []byte) {
	var settings map[string]any
	if err := json.Unmarshal(settingsJSON, &settings); err != nil {
		return
	}
	receipt, _ := settings["receipt"].(map[string]any)
	if receipt == nil {
		return
	}
	taxID, _ := receipt["tax_id"].(string)
	_, _ = pool.Exec(ctx, `
		update public.tenants set tin = nullif(trim($1), ''), updated_at = now()
		where id = $2`, taxID, tenantID)
}
