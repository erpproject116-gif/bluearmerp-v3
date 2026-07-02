package export

import (
	"archive/zip"
	"bytes"
	"fmt"
	"io"
	"strings"
)

// WriteSimpleXLSX writes a minimal Office Open XML spreadsheet with one sheet.
func WriteSimpleXLSX(w io.Writer, sheetName string, headers []string, rows [][]string) error {
	if sheetName == "" {
		sheetName = "Sheet1"
	}
	var sheetRows strings.Builder
	sheetRows.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`)
	sheetRows.WriteString(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`)
	sheetRows.WriteString(`<sheetData>`)
	writeRow := func(cells []string) {
		sheetRows.WriteString(`<row>`)
		for _, c := range cells {
			escaped := xmlEscape(c)
			if isNumeric(c) {
				sheetRows.WriteString(fmt.Sprintf(`<c t="n"><v>%s</v></c>`, escaped))
			} else {
				sheetRows.WriteString(fmt.Sprintf(`<c t="inlineStr"><is><t>%s</t></is></c>`, escaped))
			}
		}
		sheetRows.WriteString(`</row>`)
	}
	writeRow(headers)
	for _, row := range rows {
		writeRow(row)
	}
	sheetRows.WriteString(`</sheetData></worksheet>`)

	contentTypes := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`
	rels := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
	workbookRels := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`
	workbook := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="%s" sheetId="1" r:id="rId1"/></sheets>
</workbook>`, xmlEscape(sheetName))

	zw := zip.NewWriter(w)
	files := map[string]string{
		"[Content_Types].xml":        contentTypes,
		"_rels/.rels":                rels,
		"xl/workbook.xml":            workbook,
		"xl/_rels/workbook.xml.rels": workbookRels,
		"xl/worksheets/sheet1.xml":   sheetRows.String(),
	}
	for name, content := range files {
		f, err := zw.Create(name)
		if err != nil {
			return err
		}
		if _, err := io.Copy(f, bytes.NewBufferString(content)); err != nil {
			return err
		}
	}
	return zw.Close()
}

func xmlEscape(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, `"`, "&quot;")
	return s
}

func isNumeric(s string) bool {
	if s == "" {
		return false
	}
	for i, c := range s {
		if c == '.' || c == '-' {
			if i == 0 && len(s) > 1 {
				continue
			}
			return false
		}
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}
