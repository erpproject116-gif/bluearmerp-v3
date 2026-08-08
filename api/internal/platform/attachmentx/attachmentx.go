// Package attachmentx centralizes document-attachment storage directories and
// provides a best-effort helper to copy attachments from one document to another
// when documents are converted down a flow (e.g. Quotation -> Sales Order -> Sales,
// or Purchase Order -> Purchases/Supplier Invoice).
package attachmentx

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Dir returns the base storage directory for a document type's attachments.
// Keys mirror the existing per-module upload dirs so nothing moves on disk.
func Dir(key string) string {
	switch key {
	case "quotation":
		return envOr("QUOTATION_UPLOAD_DIR", "data/quotation-attachments")
	case "sales_order":
		return envOr("SALES_ORDER_UPLOAD_DIR", "data/sales-order-attachments")
	case "sales":
		return envOr("SALES_UPLOAD_DIR", "data/sales-attachments")
	case "purchase_order":
		return envOr("PURCHASE_ORDER_UPLOAD_DIR", "data/purchase-order-attachments")
	case "supplier_invoice":
		return envOr("SUPPLIER_INVOICE_UPLOAD_DIR", "data/supplier-invoice-attachments")
	default:
		return filepath.Join("data", key+"-attachments")
	}
}

func envOr(env, def string) string {
	if v := os.Getenv(env); v != "" {
		return v
	}
	return def
}

// CopyParams describes a copy of every attachment on a source document to a
// destination document. Table and column names are internal constants (never
// user input), so they are safe to interpolate into the SQL.
type CopyParams struct {
	SrcBaseDir string
	DstBaseDir string
	SrcTable   string // e.g. "public.quo_quotation_attachments"
	SrcFKCol   string // e.g. "quotation_id"
	SrcID      int64
	DstTable   string // e.g. "public.so_sales_order_attachments"
	DstFKCol   string // e.g. "sales_order_id"
	DstID      int64
	TenantID   int64
}

// Copy duplicates all attachment rows and their stored files from the source
// document to the destination document. It is best-effort: a per-file failure is
// skipped rather than aborting the whole copy, and the caller should treat a
// returned error as non-fatal (attachments are secondary to the conversion).
// The int return is how many destination rows were inserted.
func Copy(ctx context.Context, pool *pgxpool.Pool, p CopyParams) (int, error) {
	if p.SrcID <= 0 || p.DstID <= 0 {
		return 0, nil
	}
	q := fmt.Sprintf(
		`select file_name, coalesce(mime_type, ''), size_bytes, storage_path, uploaded_by_user_id, file_bytes
		 from %s where %s = $1 order by created_at`, p.SrcTable, p.SrcFKCol)
	rows, err := pool.Query(ctx, q, p.SrcID)
	if err != nil {
		return 0, err
	}
	type srcRow struct {
		fileName    string
		mimeType    string
		sizeBytes   int64
		storagePath string
		uploader    *int64
		fileBytes   []byte
	}
	var items []srcRow
	for rows.Next() {
		var s srcRow
		if err := rows.Scan(&s.fileName, &s.mimeType, &s.sizeBytes, &s.storagePath, &s.uploader, &s.fileBytes); err != nil {
			rows.Close()
			return 0, err
		}
		items = append(items, s)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}

	relDir := filepath.Join(strconv.FormatInt(p.TenantID, 10), strconv.FormatInt(p.DstID, 10))
	absDir := filepath.Join(p.DstBaseDir, relDir)

	insertSQL := fmt.Sprintf(
		`insert into %s (%s, file_name, mime_type, size_bytes, storage_path, uploaded_by_user_id, file_bytes)
		 values ($1,$2,$3,$4,$5,$6,$7)`, p.DstTable, p.DstFKCol)

	copied := 0
	var firstErr error
	for i, it := range items {
		storedName := fmt.Sprintf("%d_%d_%s", time.Now().UnixNano(), i, filepath.Base(it.fileName))
		dstStoragePath := filepath.ToSlash(filepath.Join(relDir, storedName))
		var mime any
		if it.mimeType != "" {
			mime = it.mimeType
		}

		// Bytes stored in the DB (the durable path): copy the row directly.
		if len(it.fileBytes) > 0 {
			if _, err := pool.Exec(ctx, insertSQL, p.DstID, it.fileName, mime, it.sizeBytes, dstStoragePath, it.uploader, it.fileBytes); err != nil {
				if firstErr == nil {
					firstErr = err
				}
				continue
			}
			copied++
			continue
		}

		// Legacy attachment stored on disk only: copy the file, too.
		srcAbs := filepath.Join(p.SrcBaseDir, filepath.FromSlash(it.storagePath))
		if err := os.MkdirAll(absDir, 0o755); err != nil {
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		dstAbs := filepath.Join(absDir, storedName)
		if err := copyFile(srcAbs, dstAbs); err != nil {
			if firstErr == nil {
				firstErr = fmt.Errorf("copy file %q: %w", srcAbs, err)
			}
			continue
		}
		if _, err := pool.Exec(ctx, insertSQL, p.DstID, it.fileName, mime, it.sizeBytes, dstStoragePath, it.uploader, nil); err != nil {
			_ = os.Remove(dstAbs)
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		copied++
	}
	return copied, firstErr
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		_ = os.Remove(dst)
		return err
	}
	return out.Close()
}

// Count returns how many attachment rows exist for a document.
// table and fkCol are internal constants (never user input).
func Count(ctx context.Context, pool *pgxpool.Pool, table, fkCol string, docID int64) (int, error) {
	if docID <= 0 {
		return 0, nil
	}
	q := fmt.Sprintf(`select count(*)::int from %s where %s = $1`, table, fkCol)
	var n int
	err := pool.QueryRow(ctx, q, docID).Scan(&n)
	return n, err
}
