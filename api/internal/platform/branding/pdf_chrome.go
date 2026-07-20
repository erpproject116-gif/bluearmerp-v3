package branding

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/pdf"
)

// LoadPDFChrome loads receipt branding for PDF/email renderers. On error returns empty chrome.
func LoadPDFChrome(ctx context.Context, pool *pgxpool.Pool, tenantID int64) pdf.PrintChrome {
	id, err := LoadPrintIdentity(ctx, pool, tenantID)
	if err != nil {
		return pdf.PrintChrome{}
	}
	return id.ToPDFChrome()
}
