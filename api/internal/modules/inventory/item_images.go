package inventory

import (
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/filedownload"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

const maxItemImageBytes = 5 * 1024 * 1024

func registerItemImageRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Post("/items/{id}/image", uploadItemImage(pool))
	r.Get("/items/{id}/image", serveItemImage(pool))
}

func itemImageUploadDir() string {
	if d := strings.TrimSpace(os.Getenv("ITEM_IMAGE_UPLOAD_DIR")); d != "" {
		return d
	}
	return "data/item-images"
}

func uploadItemImage(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		itemID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var exists bool
		if err := pool.QueryRow(r.Context(),
			`select exists(select 1 from public.inv_items where id = $1 and tenant_id = $2 and deleted_at is null)`,
			itemID, tu.TenantID).Scan(&exists); err != nil || !exists {
			response.Err(w, http.StatusNotFound, "Item not found.", "ERR_NOT_FOUND")
			return
		}
		if err := r.ParseMultipartForm(maxItemImageBytes + 1024); err != nil {
			response.Validation(w, map[string]string{"file": "Invalid form or file too large (max 5 MB)."})
			return
		}
		file, header, err := r.FormFile("file")
		if err != nil {
			response.Validation(w, map[string]string{"file": "File is required."})
			return
		}
		defer file.Close()
		if header.Size > maxItemImageBytes {
			response.Validation(w, map[string]string{"file": "Image exceeds 5 MB limit."})
			return
		}
		mimeType := header.Header.Get("Content-Type")
		if !strings.HasPrefix(strings.ToLower(mimeType), "image/") {
			response.Validation(w, map[string]string{"file": "File must be an image."})
			return
		}
		safeName := filepath.Base(strings.TrimSpace(header.Filename))
		if safeName == "" || safeName == "." {
			safeName = "image"
		}
		relDir := filepath.Join(strconv.FormatInt(tu.TenantID, 10), strconv.FormatInt(itemID, 10))
		absDir := filepath.Join(itemImageUploadDir(), relDir)
		if err := os.MkdirAll(absDir, 0o755); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to store image.", "ERR_INTERNAL")
			return
		}
		storedName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), safeName)
		absPath := filepath.Join(absDir, storedName)
		dst, err := os.Create(absPath)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to store image.", "ERR_INTERNAL")
			return
		}
		written, err := io.Copy(dst, io.LimitReader(file, maxItemImageBytes+1))
		_ = dst.Close()
		if err != nil {
			_ = os.Remove(absPath)
			response.Err(w, http.StatusInternalServerError, "Failed to store image.", "ERR_INTERNAL")
			return
		}
		if written > maxItemImageBytes {
			_ = os.Remove(absPath)
			response.Validation(w, map[string]string{"file": "Image exceeds 5 MB limit."})
			return
		}
		storagePath := filepath.ToSlash(filepath.Join(relDir, storedName))

		// Remove the previous image file (if any) to avoid orphaned files.
		var oldPath *string
		_ = pool.QueryRow(r.Context(), `select image_path from public.inv_items where id = $1 and tenant_id = $2`, itemID, tu.TenantID).Scan(&oldPath)

		if _, err := pool.Exec(r.Context(),
			`update public.inv_items set image_path = $1, updated_at = now() where id = $2 and tenant_id = $3`,
			storagePath, itemID, tu.TenantID); err != nil {
			_ = os.Remove(absPath)
			response.Err(w, http.StatusInternalServerError, "Failed to save image.", "ERR_INTERNAL")
			return
		}
		if oldPath != nil && strings.TrimSpace(*oldPath) != "" && *oldPath != storagePath {
			if resolved, rerr := filedownload.ResolveSafePath(itemImageUploadDir(), *oldPath); rerr == nil {
				_ = os.Remove(resolved)
			}
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.item.image.upload", "inv_item", &itemID, nil, map[string]any{
			"file_name":  safeName,
			"size_bytes": written,
		})
		response.OK(w, map[string]any{
			"id":        itemID,
			"image_url": fmt.Sprintf("/api/v1/inventory/items/%d/image", itemID),
		}, "Image uploaded.")
	}
}

func serveItemImage(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		itemID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var storagePath *string
		var updatedAt time.Time
		if err := pool.QueryRow(r.Context(),
			`select image_path, updated_at from public.inv_items where id = $1 and tenant_id = $2 and deleted_at is null`,
			itemID, tu.TenantID).Scan(&storagePath, &updatedAt); err != nil {
			response.Err(w, http.StatusNotFound, "Item not found.", "ERR_NOT_FOUND")
			return
		}
		if storagePath == nil || strings.TrimSpace(*storagePath) == "" {
			response.Err(w, http.StatusNotFound, "No image.", "ERR_NOT_FOUND")
			return
		}
		ct := mime.TypeByExtension(filepath.Ext(*storagePath))
		// Serve inline (no download name) so the browser renders it in an <img>.
		if err := filedownload.ServeStoredFile(w, r, itemImageUploadDir(), *storagePath, "", ct, updatedAt); err != nil {
			response.Err(w, http.StatusNotFound, "Image not found.", "ERR_NOT_FOUND")
		}
	}
}
