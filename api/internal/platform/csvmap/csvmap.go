package csvmap

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

const DefaultMaxBytes = 5 << 20
const DefaultMaxRows = 5000

// Remap rewrites CSV rows so headers become canonical keys.
// columnMap maps canonical key → source CSV header name in the uploaded file.
func Remap(records [][]string, columnMap map[string]string, required, canonicalHeaders []string) ([][]string, error) {
	for _, col := range required {
		src := strings.TrimSpace(columnMap[col])
		if src == "" {
			return nil, fmt.Errorf("missing required column mapping: %s", col)
		}
	}
	if len(records) < 1 {
		return nil, fmt.Errorf("CSV must include a header row")
	}
	fileIdx := map[string]int{}
	for i, h := range records[0] {
		key := strings.ToLower(strings.TrimSpace(h))
		if key != "" {
			fileIdx[key] = i
		}
	}
	srcIdx := map[string]int{}
	for canonical, sourceHeader := range columnMap {
		canonical = strings.ToLower(strings.TrimSpace(canonical))
		sourceHeader = strings.TrimSpace(sourceHeader)
		if canonical == "" || sourceHeader == "" {
			continue
		}
		i, ok := fileIdx[strings.ToLower(sourceHeader)]
		if !ok {
			return nil, fmt.Errorf("column_map source header not found in file: %s", sourceHeader)
		}
		srcIdx[canonical] = i
	}
	for _, col := range required {
		if _, ok := srcIdx[col]; !ok {
			return nil, fmt.Errorf("missing required column mapping: %s", col)
		}
	}
	out := make([][]string, 0, len(records))
	out = append(out, append([]string(nil), canonicalHeaders...))
	for _, raw := range records[1:] {
		if isEmptyRow(raw) {
			continue
		}
		row := make([]string, len(canonicalHeaders))
		for i, col := range canonicalHeaders {
			if idx, ok := srcIdx[col]; ok && idx < len(raw) {
				row[i] = strings.TrimSpace(raw[idx])
			}
		}
		out = append(out, row)
	}
	return out, nil
}

func isEmptyRow(row []string) bool {
	for _, c := range row {
		if strings.TrimSpace(c) != "" {
			return false
		}
	}
	return true
}

// ReadUpload parses multipart file + optional profile_id / column_map JSON.
func ReadUpload(r *http.Request, maxBytes int64, loadProfile func(profileID int64) (map[string]string, error)) ([][]string, map[string]string, error) {
	if maxBytes <= 0 {
		maxBytes = DefaultMaxBytes
	}
	if err := r.ParseMultipartForm(maxBytes); err != nil {
		return nil, nil, fmt.Errorf("invalid upload")
	}
	file, _, err := r.FormFile("file")
	if err != nil {
		return nil, nil, fmt.Errorf("CSV file is required")
	}
	defer file.Close()
	records, err := csv.NewReader(file).ReadAll()
	if err != nil {
		return nil, nil, fmt.Errorf("could not read CSV")
	}
	colMap, err := resolveColumnMap(r, loadProfile)
	if err != nil {
		return nil, nil, err
	}
	return records, colMap, nil
}

func resolveColumnMap(r *http.Request, loadProfile func(profileID int64) (map[string]string, error)) (map[string]string, error) {
	rawMap := strings.TrimSpace(r.FormValue("column_map"))
	if rawMap != "" {
		var colMap map[string]string
		if err := json.Unmarshal([]byte(rawMap), &colMap); err != nil {
			return nil, fmt.Errorf("column_map must be valid JSON object")
		}
		if colMap == nil {
			colMap = map[string]string{}
		}
		// Live map wins when both profile_id and column_map are sent.
		if len(colMap) > 0 {
			return colMap, nil
		}
	}
	if rawID := strings.TrimSpace(r.FormValue("profile_id")); rawID != "" {
		profileID, err := strconv.ParseInt(rawID, 10, 64)
		if err != nil || profileID <= 0 {
			return nil, fmt.Errorf("invalid profile_id")
		}
		if loadProfile == nil {
			return nil, fmt.Errorf("import profile not found")
		}
		return loadProfile(profileID)
	}
	return nil, fmt.Errorf("profile_id or column_map is required")
}

// RowsToMaps converts remapped CSV (header + rows) into maps keyed by header.
func RowsToMaps(records [][]string) []map[string]string {
	if len(records) < 2 {
		return nil
	}
	headers := records[0]
	out := make([]map[string]string, 0, len(records)-1)
	for _, row := range records[1:] {
		m := map[string]string{}
		for i, h := range headers {
			if i < len(row) {
				m[h] = strings.TrimSpace(row[i])
			} else {
				m[h] = ""
			}
		}
		out = append(out, m)
	}
	return out
}
