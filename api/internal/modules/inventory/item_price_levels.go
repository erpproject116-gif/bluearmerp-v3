package inventory

import (
	"encoding/json"
	"fmt"
	"strings"
)

// Price level keys B–J (ECount item master).
var validPriceLevelKeys = map[string]struct{}{
	"B": {}, "C": {}, "D": {}, "E": {}, "F": {}, "G": {}, "H": {}, "I": {}, "J": {},
}

// Safety stock document types (ECount 7 doc-type pills).
var validSafetyDocTypes = map[string]struct{}{
	"quotation":       {},
	"sales_order":     {},
	"shipping_order":  {},
	"sales":           {},
	"goods_receipt":   {},
	"purchase_order":  {},
	"purchase":        {},
}

func sanitizePriceLevels(in map[string]float64) map[string]float64 {
	if len(in) == 0 {
		return map[string]float64{}
	}
	out := make(map[string]float64, len(in))
	for k, v := range in {
		key := strings.ToUpper(strings.TrimSpace(k))
		if _, ok := validPriceLevelKeys[key]; !ok {
			continue
		}
		if v < 0 {
			continue
		}
		out[key] = v
	}
	return out
}

func sanitizeSafetyStockByDoc(in map[string]float64) map[string]float64 {
	if len(in) == 0 {
		return map[string]float64{}
	}
	out := make(map[string]float64, len(in))
	for k, v := range in {
		key := strings.TrimSpace(k)
		if _, ok := validSafetyDocTypes[key]; !ok {
			continue
		}
		if v < 0 {
			continue
		}
		out[key] = v
	}
	return out
}

func marshalJSONMap(m map[string]float64) ([]byte, error) {
	if m == nil {
		m = map[string]float64{}
	}
	return json.Marshal(m)
}

func unmarshalJSONFloatMap(b []byte) map[string]float64 {
	if len(b) == 0 {
		return map[string]float64{}
	}
	var m map[string]float64
	if err := json.Unmarshal(b, &m); err != nil || m == nil {
		return map[string]float64{}
	}
	return m
}

func safetyLevelExpr(docType string) string {
	if docType == "" {
		return "coalesce(bal.reorder_level, i.reorder_level)"
	}
	// Caller must pass validated docType only.
	return fmt.Sprintf(`coalesce(
		nullif((i.safety_stock_by_doc->>%[1]q)::numeric, 0),
		bal.reorder_level,
		i.reorder_level
	)`, docType)
}
