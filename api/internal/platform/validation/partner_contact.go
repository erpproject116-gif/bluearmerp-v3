package validation

import "strings"

// PartnerContact holds optional partner contact fields for validation.
type PartnerContact struct {
	Mobile *string
	Phone  *string
	Email  *string
	Tin    *string
}

// PartnerContactFields holds pointers to optional partner contact field pointers for normalization.
type PartnerContactFields struct {
	Mobile **string
	Phone  **string
	Email  **string
	Tin    **string
}

// ValidatePartnerContact returns field-keyed errors for invalid optional contact values.
func ValidatePartnerContact(c PartnerContact) map[string]string {
	errs := map[string]string{}
	if c.Mobile != nil && strings.TrimSpace(*c.Mobile) != "" {
		if _, ok := NormalizePHMobileLocal(*c.Mobile); !ok {
			errs["mobile"] = "Enter a valid Philippine mobile number (e.g. 0917 123 4567)."
		}
	}
	if c.Phone != nil && strings.TrimSpace(*c.Phone) != "" {
		if _, ok := NormalizePHPhone(*c.Phone); !ok {
			errs["phone"] = "Enter a valid phone number (7–11 digits)."
		}
	}
	if c.Email != nil && strings.TrimSpace(*c.Email) != "" {
		if _, ok := NormalizeEmail(*c.Email); !ok {
			errs["email"] = "Enter a valid email address."
		}
	}
	if c.Tin != nil && strings.TrimSpace(*c.Tin) != "" {
		if _, ok := NormalizePHTIN(*c.Tin); !ok {
			errs["tin"] = "Enter a valid TIN: " + PHTINFormatHint + "."
		}
	}
	if len(errs) == 0 {
		return nil
	}
	return errs
}

// NormalizePartnerContactFields trims, validates, and canonicalizes optional contact fields in place.
func NormalizePartnerContactFields(f PartnerContactFields) {
	normalizeOptional(f.Mobile, func(raw string) (string, bool) {
		if strings.TrimSpace(raw) == "" {
			return "", false
		}
		return NormalizePHMobileLocal(raw)
	})
	normalizeOptional(f.Phone, func(raw string) (string, bool) {
		if strings.TrimSpace(raw) == "" {
			return "", false
		}
		return NormalizePHPhone(raw)
	})
	normalizeOptional(f.Email, func(raw string) (string, bool) {
		if strings.TrimSpace(raw) == "" {
			return "", false
		}
		return NormalizeEmail(raw)
	})
	normalizeOptional(f.Tin, func(raw string) (string, bool) {
		if strings.TrimSpace(raw) == "" {
			return "", false
		}
		return NormalizePHTIN(raw)
	})
}

func normalizeOptional(p **string, normalize func(string) (string, bool)) {
	if p == nil || *p == nil {
		return
	}
	raw := strings.TrimSpace(**p)
	if raw == "" {
		*p = nil
		return
	}
	if norm, ok := normalize(raw); ok {
		*p = &norm
	}
}
