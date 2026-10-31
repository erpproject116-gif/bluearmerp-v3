package migration

import (
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/attachmentx"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// Kinds that may be linked via mig_import_keys (metadata only — no module attachment copy).
var vaultLinkAllowlist = map[string]bool{
	"open_quo": true, "open_so": true, "open_si": true, "open_po": true, "open_ap": true,
	"open_pr": true, "open_rfq": true, "opening_stock": true, "opening_lots": true, "in_transit": true,
}

type vaultRow struct {
	ID               int64  `json:"id"`
	LegacyDocType    string `json:"legacy_doc_type"`
	LegacyDocNo      string `json:"legacy_doc_no"`
	FileName         string `json:"file_name"`
	ContentType      string `json:"content_type"`
	ByteSize         int64  `json:"byte_size"`
	ChecksumSHA256   string `json:"checksum_sha256"`
	IsOrphan         bool   `json:"is_orphan"`
	LinkedEntityType string `json:"linked_entity_type,omitempty"`
	LinkedEntityID   *int64 `json:"linked_entity_id,omitempty"`
	CreatedAt        string `json:"created_at"`
}

func listAttachmentVault(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		orphansOnly := r.URL.Query().Get("orphans") == "1"
		q := `
			select id, coalesce(legacy_doc_type,''), coalesce(legacy_doc_no,''), file_name,
			       content_type, byte_size, checksum_sha256, is_orphan,
			       coalesce(linked_entity_type,''), linked_entity_id, created_at::text
			from public.mig_attachment_vault
			where tenant_id = $1`
		if orphansOnly {
			q += ` and is_orphan = true`
		}
		q += ` order by id desc limit 200`
		rows, err := pool.Query(r.Context(), q, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list vault.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []vaultRow
		for rows.Next() {
			var row vaultRow
			var linkedType string
			var linkedID *int64
			if err := rows.Scan(&row.ID, &row.LegacyDocType, &row.LegacyDocNo, &row.FileName,
				&row.ContentType, &row.ByteSize, &row.ChecksumSHA256, &row.IsOrphan,
				&linkedType, &linkedID, &row.CreatedAt); err != nil {
				continue
			}
			row.LinkedEntityType = linkedType
			row.LinkedEntityID = linkedID
			out = append(out, row)
		}
		if out == nil {
			out = []vaultRow{}
		}
		response.OK(w, map[string]any{"items": out}, "OK")
	}
}

// importAttachmentVault accepts multipart: optional manifest CSV + one or more files.
// Manifest columns: file_name, legacy_doc_type, legacy_doc_no, checksum_sha256 (optional).
func importAttachmentVault(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		if err := r.ParseMultipartForm(32 << 20); err != nil {
			response.Validation(w, map[string]string{"body": "multipart form required (max 32MiB)."})
			return
		}
		manifest := map[string]struct {
			DocType  string
			DocNo    string
			Checksum string
		}{}
		if mf, _, err := r.FormFile("manifest"); err == nil {
			defer mf.Close()
			cr := csv.NewReader(mf)
			cr.TrimLeadingSpace = true
			header, err := cr.Read()
			if err == nil {
				idx := map[string]int{}
				for i, h := range header {
					idx[strings.ToLower(strings.TrimSpace(h))] = i
				}
				for {
					rec, err := cr.Read()
					if err == io.EOF {
						break
					}
					if err != nil {
						break
					}
					get := func(k string) string {
						i, ok := idx[k]
						if !ok || i >= len(rec) {
							return ""
						}
						return strings.TrimSpace(rec[i])
					}
					fn := get("file_name")
					if fn == "" {
						continue
					}
					manifest[fn] = struct {
						DocType  string
						DocNo    string
						Checksum string
					}{get("legacy_doc_type"), get("legacy_doc_no"), strings.ToLower(get("checksum_sha256"))}
				}
			}
		}
		files := r.MultipartForm.File["files"]
		if len(files) == 0 {
			files = r.MultipartForm.File["file"]
		}
		if len(files) == 0 {
			response.Validation(w, map[string]string{"files": "Attach one or more files under files=."})
			return
		}
		base := filepath.Join(attachmentx.Dir("migration-vault"), fmt.Sprintf("tenant-%d", tu.TenantID))
		_ = os.MkdirAll(base, 0o755)
		created, failed, orphans := 0, 0, 0
		var rowErrors []importRowError
		for i, fh := range files {
			f, err := fh.Open()
			if err != nil {
				failed++
				rowErrors = append(rowErrors, importRowError{Row: i + 1, Message: "open failed"})
				continue
			}
			sum := sha256.New()
			tmp := filepath.Join(base, fmt.Sprintf(".tmp-%d-%s", i, filepath.Base(fh.Filename)))
			out, err := os.Create(tmp)
			if err != nil {
				_ = f.Close()
				failed++
				rowErrors = append(rowErrors, importRowError{Row: i + 1, Message: "create failed"})
				continue
			}
			n, err := io.Copy(out, io.TeeReader(f, sum))
			_ = out.Close()
			_ = f.Close()
			if err != nil {
				_ = os.Remove(tmp)
				failed++
				rowErrors = append(rowErrors, importRowError{Row: i + 1, Message: "read failed"})
				continue
			}
			checksum := hex.EncodeToString(sum.Sum(nil))
			meta := manifest[fh.Filename]
			if meta.Checksum != "" && meta.Checksum != checksum {
				_ = os.Remove(tmp)
				failed++
				rowErrors = append(rowErrors, importRowError{Row: i + 1, Message: "checksum mismatch"})
				continue
			}
			final := filepath.Join(base, checksum+"_"+filepath.Base(fh.Filename))
			if err := os.Rename(tmp, final); err != nil {
				_ = os.Remove(tmp)
				failed++
				rowErrors = append(rowErrors, importRowError{Row: i + 1, Message: "store failed"})
				continue
			}
			ct := fh.Header.Get("Content-Type")
			if ct == "" {
				ct = "application/octet-stream"
			}
			isOrphan := true
			_, err = pool.Exec(r.Context(), `
				insert into public.mig_attachment_vault (
				  tenant_id, legacy_doc_type, legacy_doc_no, file_name, content_type,
				  byte_size, checksum_sha256, storage_path, is_orphan, created_by_user_id
				) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
				on conflict (tenant_id, checksum_sha256, file_name) do nothing`,
				tu.TenantID, meta.DocType, meta.DocNo, fh.Filename, ct, n, checksum, final, isOrphan, tu.AppUserID)
			if err != nil {
				failed++
				rowErrors = append(rowErrors, importRowError{Row: i + 1, Message: "db failed"})
				continue
			}
			created++
			if isOrphan {
				orphans++
			}
		}
		response.OK(w, map[string]any{
			"created": created, "failed": failed, "orphans": orphans, "row_errors": rowErrors,
		}, "Vault import finished.")
	}
}

type linkVaultBody struct {
	LegacyDocType    string `json:"legacy_doc_type"`
	LegacyDocNo      string `json:"legacy_doc_no"`
	LinkedEntityType string `json:"linked_entity_type"`
	LinkedEntityID   int64  `json:"linked_entity_id"`
}

// linkAttachmentVault sets linked_entity_* from mig_import_keys and clears is_orphan.
// Does not insert into quotation/sales/PO attachment tables.
func linkAttachmentVault(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		vaultID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || vaultID <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid vault id."})
			return
		}
		var body linkVaultBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}

		kind := strings.TrimSpace(body.LegacyDocType)
		docNo := strings.TrimSpace(body.LegacyDocNo)
		entityType := strings.TrimSpace(body.LinkedEntityType)
		entityID := body.LinkedEntityID

		if kind != "" && docNo != "" {
			if !vaultLinkAllowlist[kind] {
				response.Validation(w, map[string]string{"legacy_doc_type": "Kind not in vault link allowlist."})
				return
			}
			hit, docID := alreadyImported(r.Context(), pool, tu.TenantID, kind, docNo)
			if !hit || docID <= 0 {
				response.Validation(w, map[string]string{"legacy_doc_no": "No Migration Center import key for that kind/source_doc_no."})
				return
			}
			entityType = kind
			entityID = docID
		} else if entityType != "" && entityID > 0 {
			if !vaultLinkAllowlist[entityType] {
				response.Validation(w, map[string]string{"linked_entity_type": "Type not in vault link allowlist."})
				return
			}
			var exists bool
			err := pool.QueryRow(r.Context(), `
				select exists(
				  select 1 from public.mig_import_keys
				  where tenant_id = $1 and kind = $2 and document_id = $3
				)`, tu.TenantID, entityType, entityID).Scan(&exists)
			if err != nil || !exists {
				response.Validation(w, map[string]string{"linked_entity_id": "No Migration Center import key for that type/id."})
				return
			}
		} else {
			response.Validation(w, map[string]string{
				"body": "Provide legacy_doc_type+legacy_doc_no or linked_entity_type+linked_entity_id.",
			})
			return
		}

		tag, err := pool.Exec(r.Context(), `
			update public.mig_attachment_vault
			set linked_entity_type = $3,
			    linked_entity_id = $4,
			    legacy_doc_type = case when coalesce(legacy_doc_type,'') = '' then $3 else legacy_doc_type end,
			    legacy_doc_no = case when coalesce(legacy_doc_no,'') = '' then $5 else legacy_doc_no end,
			    is_orphan = false
			where id = $1 and tenant_id = $2`,
			vaultID, tu.TenantID, entityType, entityID, docNo,
		)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to link vault row.", "ERR_INTERNAL")
			return
		}
		if tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Vault row not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{
			"id":                 vaultID,
			"linked_entity_type": entityType,
			"linked_entity_id":   entityID,
			"is_orphan":          false,
		}, "Linked.")
	}
}
