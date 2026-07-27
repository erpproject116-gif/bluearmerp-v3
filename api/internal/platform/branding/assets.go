package branding

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/filedownload"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

var allowedImageMIME = map[string]struct{}{
	"image/png":  {},
	"image/jpeg": {},
	"image/gif":  {},
	"image/webp": {},
}

func uploadCompanyLogo(pool *pgxpool.Pool) http.HandlerFunc {
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
		assetID, err := saveUploadedImage(r, pool, tu, "company_logo", 0, maxLogoBytes)
		if err != nil {
			writeUploadErr(w, err)
			return
		}
		merged, err := mergeSettingsPatch(r.Context(), pool, tu.TenantID, json.RawMessage(fmt.Sprintf(`{"receipt":{"logo_asset_id":%d}}`, assetID)))
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to link logo.", "ERR_INTERNAL")
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
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "branding.logo_upload", "tenant_branding_asset", &assetID, nil, nil)
		response.OK(w, map[string]any{
			"id":       assetID,
			"logo_url": assetInlineURL(assetID),
		}, "Uploaded.")
	}
}

func uploadUserAvatar(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		assetID, err := saveUploadedImage(r, pool, tu, "user_avatar", tu.AppUserID, maxAvatarBytes)
		if err != nil {
			writeUploadErr(w, err)
			return
		}
		ref := fmt.Sprintf("branding-asset:%d", assetID)
		_, err = pool.Exec(r.Context(), `update public.users set avatar_url = $1 where id = $2 and tenant_id = $3`, ref, tu.AppUserID, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save avatar.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "branding.avatar_upload", "tenant_branding_asset", &assetID, nil, nil)
		response.OK(w, map[string]any{
			"id":          assetID,
			"avatar_url":  ResolveAvatarRef(ref),
		}, "Uploaded.")
	}
}

type uploadErr struct {
	status int
	fields map[string]string
	code   string
	msg    string
}

func (e *uploadErr) Error() string { return e.msg }

func writeUploadErr(w http.ResponseWriter, err error) {
	if ue, ok := err.(*uploadErr); ok {
		if ue.fields != nil {
			response.Validation(w, ue.fields)
			return
		}
		response.Err(w, ue.status, ue.msg, ue.code)
		return
	}
	response.Err(w, http.StatusInternalServerError, "Upload failed.", "ERR_INTERNAL")
}

func saveUploadedImage(r *http.Request, pool *pgxpool.Pool, tu auth.TenantUser, kind string, userID int64, maxBytes int64) (int64, error) {
	if err := r.ParseMultipartForm(maxBytes + 1024); err != nil {
		return 0, &uploadErr{fields: map[string]string{"file": fmt.Sprintf("Invalid multipart form or file too large (max %d MB).", maxBytes/(1024*1024))}}
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		return 0, &uploadErr{fields: map[string]string{"file": "File is required."}}
	}
	defer file.Close()
	if header.Size > maxBytes {
		return 0, &uploadErr{fields: map[string]string{"file": fmt.Sprintf("File exceeds %d MB limit.", maxBytes/(1024*1024))}}
	}
	mimeType := strings.ToLower(strings.TrimSpace(header.Header.Get("Content-Type")))
	if _, ok := allowedImageMIME[mimeType]; mimeType != "" && !ok {
		return 0, &uploadErr{fields: map[string]string{"file": "Image must be PNG, JPEG, GIF, or WebP."}}
	}
	safeName := filepath.Base(strings.TrimSpace(header.Filename))
	if safeName == "" || safeName == "." {
		return 0, &uploadErr{fields: map[string]string{"file": "Invalid file name."}}
	}
	subdir := "logos"
	if kind == "user_avatar" {
		subdir = "avatars"
	}
	relDir := filepath.Join(strconv.FormatInt(tu.TenantID, 10), subdir)
	absDir := filepath.Join(uploadDir(), relDir)
	if err := os.MkdirAll(absDir, 0o755); err != nil {
		return 0, &uploadErr{status: http.StatusInternalServerError, code: "ERR_INTERNAL", msg: "Failed to store file."}
	}
	storedName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), safeName)
	absPath := filepath.Join(absDir, storedName)
	dst, err := os.Create(absPath)
	if err != nil {
		return 0, &uploadErr{status: http.StatusInternalServerError, code: "ERR_INTERNAL", msg: "Failed to store file."}
	}
	written, err := io.Copy(dst, io.LimitReader(file, maxBytes+1))
	_ = dst.Close()
	if err != nil {
		_ = os.Remove(absPath)
		return 0, &uploadErr{status: http.StatusInternalServerError, code: "ERR_INTERNAL", msg: "Failed to store file."}
	}
	if written > maxBytes {
		_ = os.Remove(absPath)
		return 0, &uploadErr{fields: map[string]string{"file": fmt.Sprintf("File exceeds %d MB limit.", maxBytes/(1024*1024))}}
	}
	storagePath := filepath.ToSlash(filepath.Join(relDir, storedName))
	return storeAsset(r.Context(), pool, tu.TenantID, userID, tu.AppUserID, kind, safeName, mimeType, storagePath, written)
}

func downloadAsset(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		assetID, err := strconv.ParseInt(chi.URLParam(r, "assetId"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"assetId": "Invalid asset id."})
			return
		}
		var fileName, storagePath, mimeType, kind string
		var userID *int64
		var createdAt time.Time
		err = pool.QueryRow(r.Context(), `
			select file_name, storage_path, coalesce(mime_type, ''), asset_kind, user_id, created_at
			from public.tenant_branding_assets
			where id = $1 and tenant_id = $2`, assetID, tu.TenantID).
			Scan(&fileName, &storagePath, &mimeType, &kind, &userID, &createdAt)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Asset not found.", "ERR_NOT_FOUND")
			return
		}
		if kind == "user_avatar" && userID != nil && *userID != tu.AppUserID && !tu.CanManageBranding() {
			response.Err(w, http.StatusForbidden, "You cannot access this avatar.", "ERR_FORBIDDEN")
			return
		}
		inline := strings.TrimSpace(r.URL.Query().Get("inline")) == "1"
		if inline {
			abs, err := filedownload.ResolveSafePath(uploadDir(), storagePath)
			if err != nil {
				response.Err(w, http.StatusNotFound, "Asset not found.", "ERR_NOT_FOUND")
				return
			}
			f, err := os.Open(abs)
			if err != nil {
				response.Err(w, http.StatusNotFound, "Asset not found.", "ERR_NOT_FOUND")
				return
			}
			defer f.Close()
			if mimeType != "" {
				w.Header().Set("Content-Type", mimeType)
			}
			w.Header().Set("Content-Disposition", "inline")
			http.ServeContent(w, r, fileName, createdAt, f)
			return
		}
		if err := filedownload.ServeStoredFile(w, r, uploadDir(), storagePath, fileName, mimeType, createdAt); err != nil {
			response.Err(w, http.StatusNotFound, "Asset not found.", "ERR_NOT_FOUND")
		}
	}
}

func deleteAsset(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		assetID, err := strconv.ParseInt(chi.URLParam(r, "assetId"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"assetId": "Invalid asset id."})
			return
		}
		var storagePath, kind string
		var userID *int64
		err = pool.QueryRow(r.Context(), `
			select storage_path, asset_kind, user_id
			from public.tenant_branding_assets
			where id = $1 and tenant_id = $2`, assetID, tu.TenantID).
			Scan(&storagePath, &kind, &userID)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Asset not found.", "ERR_NOT_FOUND")
			return
		}
		if kind == "company_logo" {
			if !tu.CanManageBranding() {
				response.Err(w, http.StatusForbidden, "You cannot delete this asset.", "ERR_FORBIDDEN")
				return
			}
		} else if kind == "user_avatar" {
			if userID == nil || (*userID != tu.AppUserID && !tu.CanManageBranding()) {
				response.Err(w, http.StatusForbidden, "You cannot delete this asset.", "ERR_FORBIDDEN")
				return
			}
		}
		_, err = pool.Exec(r.Context(), `delete from public.tenant_branding_assets where id = $1 and tenant_id = $2`, assetID, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to delete asset.", "ERR_INTERNAL")
			return
		}
		if abs, err := filedownload.ResolveSafePath(uploadDir(), storagePath); err == nil {
			_ = os.Remove(abs)
		}
		if kind == "company_logo" {
			_, _ = pool.Exec(r.Context(), `
				update public.tenant_branding
				set settings = settings #- '{receipt,logo_asset_id}',
				    updated_at = now()
				where tenant_id = $1 and (settings->'receipt'->>'logo_asset_id')::bigint = $2`, tu.TenantID, assetID)
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "branding.asset_delete", "tenant_branding_asset", &assetID, nil, nil)
		response.OK(w, nil, "Deleted.")
	}
}

func loadMergedSettings(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (map[string]any, bool, error) {
	var raw []byte
	err := pool.QueryRow(ctx, `select settings from public.tenant_branding where tenant_id = $1`, tenantID).Scan(&raw)
	hasRow := true
	if err != nil {
		if err != pgx.ErrNoRows {
			return nil, false, err
		}
		hasRow = false
		raw = []byte("{}")
	}
	merged := deepMergeJSON([]byte(DefaultSettingsJSON), raw)
	var out map[string]any
	_ = json.Unmarshal(merged, &out)
	enrichReceiptFromTenant(ctx, pool, tenantID, out)
	return out, hasRow, nil
}

func mergeSettingsPatch(ctx context.Context, pool *pgxpool.Pool, tenantID int64, patch json.RawMessage) ([]byte, error) {
	current, _, err := loadMergedSettings(ctx, pool, tenantID)
	if err != nil {
		return nil, err
	}
	curBytes, _ := json.Marshal(current)
	mergedBytes := deepMergeJSON(curBytes, patch)

	// Saving colors/labels must not clear logo_asset_id when the client sends null.
	// Explicit logo removal goes through DELETE /branding/assets/{id}.
	var mergedMap map[string]any
	_ = json.Unmarshal(mergedBytes, &mergedMap)
	preserveLogoAssetID(current, mergedMap, patch)
	out, _ := json.Marshal(mergedMap)
	return out, nil
}

func preserveLogoAssetID(current, merged map[string]any, patch json.RawMessage) {
	curReceipt, _ := current["receipt"].(map[string]any)
	merReceipt, _ := merged["receipt"].(map[string]any)
	if merReceipt == nil {
		return
	}
	curID := logoAssetIDFromMap(nil)
	if curReceipt != nil {
		curID = logoAssetIDFromMap(curReceipt["logo_asset_id"])
	}
	merID := logoAssetIDFromMap(merReceipt["logo_asset_id"])
	if curID > 0 && merID <= 0 {
		var patchMap map[string]any
		_ = json.Unmarshal(patch, &patchMap)
		patchReceipt, _ := patchMap["receipt"].(map[string]any)
		if patchReceipt == nil {
			merReceipt["logo_asset_id"] = curID
			return
		}
		if _, explicit := patchReceipt["logo_asset_id"]; !explicit {
			merReceipt["logo_asset_id"] = curID
			return
		}
		// Explicit null/0 in patch — still preserve; delete asset endpoint clears logo.
		merReceipt["logo_asset_id"] = curID
	}
}

func enrichReceiptFromTenant(ctx context.Context, pool *pgxpool.Pool, tenantID int64, settings map[string]any) {
	receipt, _ := settings["receipt"].(map[string]any)
	if receipt == nil {
		receipt = map[string]any{}
		settings["receipt"] = receipt
	}
	var companyName, email, phone, address *string
	_ = pool.QueryRow(ctx, `
		select company_name, email, phone, address from public.tenants where id = $1`, tenantID).
		Scan(&companyName, &email, &phone, &address)
	setIfEmpty(receipt, "company_name", companyName)
	setIfEmpty(receipt, "email", email)
	setIfEmpty(receipt, "phone", phone)
	setIfEmpty(receipt, "address", address)
}

// logoAssetFileMissing reports whether receipt.logo_asset_id points at a missing
// DB row or disk file (common after ephemeral upload volume wipe). Does not mutate settings.
func logoAssetFileMissing(ctx context.Context, pool *pgxpool.Pool, tenantID int64, settings map[string]any) bool {
	receipt, _ := settings["receipt"].(map[string]any)
	if receipt == nil {
		return false
	}
	assetID := logoAssetIDFromMap(receipt["logo_asset_id"])
	if assetID <= 0 {
		return false
	}
	var storagePath string
	err := pool.QueryRow(ctx, `
		select storage_path
		from public.tenant_branding_assets
		where id = $1 and tenant_id = $2`, assetID, tenantID).Scan(&storagePath)
	if err != nil {
		return true
	}
	abs, err := filedownload.ResolveSafePath(uploadDir(), storagePath)
	if err != nil {
		return true
	}
	if _, err := os.Stat(abs); err != nil {
		return true
	}
	return false
}

// stripStaleLogoAsset clears logo_asset_id from the in-memory settings map when the
// asset file is gone. Prefer logoAssetFileMissing for GET responses (do not persist wipe).
func stripStaleLogoAsset(ctx context.Context, pool *pgxpool.Pool, tenantID int64, settings map[string]any) bool {
	if !logoAssetFileMissing(ctx, pool, tenantID, settings) {
		return false
	}
	receipt, _ := settings["receipt"].(map[string]any)
	if receipt == nil {
		return false
	}
	delete(receipt, "logo_asset_id")
	return true
}

func logoAssetIDFromMap(v any) int64 {
	switch n := v.(type) {
	case float64:
		return int64(n)
	case int64:
		return n
	case int:
		return int64(n)
	case json.Number:
		i, _ := n.Int64()
		return i
	default:
		return 0
	}
}
