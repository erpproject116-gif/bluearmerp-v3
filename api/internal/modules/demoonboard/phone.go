package demoonboard

import "github.com/bluearm/bluearm-erp-v3/api/internal/platform/validation"

// normalizePHMobile delegates to shared PH mobile validation.
func normalizePHMobile(raw string) (string, bool) {
	return validation.NormalizePHMobile(raw)
}
