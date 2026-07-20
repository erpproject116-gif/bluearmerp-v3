package branding

import (
	"context"
	"os"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/filedownload"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/pdf"
)

// PrintIdentity is the resolved receipt branding used on printable/emailable PDFs.
type PrintIdentity struct {
	CompanyName string
	HeaderText  string
	FooterText  string
	Address     string
	Phone       string
	Email       string
	TaxID       string
	LogoData    []byte
	LogoType    string // PNG, JPG, or GIF for gofpdf
}

// LoadPrintIdentity merges tenant branding receipt settings with tenant fallbacks
// (same precedence as web receiptBranding.ts).
func LoadPrintIdentity(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (PrintIdentity, error) {
	settings, _, err := loadMergedSettings(ctx, pool, tenantID)
	if err != nil {
		return PrintIdentity{}, err
	}
	_ = stripStaleLogoAsset(ctx, pool, tenantID, settings)

	receipt, _ := settings["receipt"].(map[string]any)
	if receipt == nil {
		receipt = map[string]any{}
	}

	id := PrintIdentity{
		CompanyName: strFromMap(receipt, "company_name"),
		Address:     strFromMap(receipt, "address"),
		Phone:       strFromMap(receipt, "phone"),
		Email:       strFromMap(receipt, "email"),
		TaxID:       strFromMap(receipt, "tax_id"),
		FooterText:  strFromMap(receipt, "footer_text"),
	}

	var headerParts []string
	if ht := strFromMap(receipt, "header_text"); ht != "" {
		headerParts = append(headerParts, ht)
	}
	for _, line := range formatReceiptContactLines(id) {
		dup := false
		for _, p := range headerParts {
			if p == line {
				dup = true
				break
			}
		}
		if !dup {
			headerParts = append(headerParts, line)
		}
	}
	id.HeaderText = strings.Join(headerParts, "\n")

	if id.CompanyName == "" {
		id.CompanyName = "Company"
	}

	assetID := logoAssetIDFromMap(receipt["logo_asset_id"])
	if assetID > 0 {
		data, mime, logoErr := loadLogoBytes(ctx, pool, tenantID, assetID)
		if logoErr == nil && len(data) > 0 {
			id.LogoData = data
			id.LogoType = mimeToGofpdfType(mime)
		}
	}
	return id, nil
}

// ToPDFChrome maps identity into pdf.PrintChrome for document renderers.
func (id PrintIdentity) ToPDFChrome() pdf.PrintChrome {
	return pdf.PrintChrome{
		CompanyName: id.CompanyName,
		HeaderText:  id.HeaderText,
		FooterText:  id.FooterText,
		Address:     id.Address,
		Phone:       id.Phone,
		Email:       id.Email,
		LogoData:    id.LogoData,
		LogoType:    id.LogoType,
	}
}

func formatReceiptContactLines(id PrintIdentity) []string {
	var lines []string
	if id.Address != "" {
		lines = append(lines, id.Address)
	}
	var contact []string
	if id.Phone != "" {
		contact = append(contact, id.Phone)
	}
	if id.Email != "" {
		contact = append(contact, id.Email)
	}
	if len(contact) > 0 {
		lines = append(lines, strings.Join(contact, " · "))
	}
	if id.TaxID != "" {
		lines = append(lines, "Tax ID: "+id.TaxID)
	}
	return lines
}

func strFromMap(m map[string]any, key string) string {
	v, _ := m[key].(string)
	return strings.TrimSpace(v)
}

func loadLogoBytes(ctx context.Context, pool *pgxpool.Pool, tenantID, assetID int64) ([]byte, string, error) {
	var storagePath, mimeType string
	err := pool.QueryRow(ctx, `
		select storage_path, coalesce(mime_type, '')
		from public.tenant_branding_assets
		where id = $1 and tenant_id = $2 and asset_kind = 'company_logo'`, assetID, tenantID).
		Scan(&storagePath, &mimeType)
	if err != nil {
		return nil, "", err
	}
	abs, err := filedownload.ResolveSafePath(uploadDir(), storagePath)
	if err != nil {
		return nil, "", err
	}
	data, err := os.ReadFile(abs)
	if err != nil {
		return nil, "", err
	}
	return data, mimeType, nil
}

func mimeToGofpdfType(mime string) string {
	mime = strings.ToLower(strings.TrimSpace(mime))
	switch {
	case strings.Contains(mime, "png"):
		return "PNG"
	case strings.Contains(mime, "jpeg"), strings.Contains(mime, "jpg"):
		return "JPG"
	case strings.Contains(mime, "gif"):
		return "GIF"
	default:
		return "PNG"
	}
}
