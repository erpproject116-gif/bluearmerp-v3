package formfields

import (
	"encoding/json"
	"strings"
)

func jsonBool(v any) (bool, bool) {
	switch t := v.(type) {
	case bool:
		return t, true
	case string:
		if t == "true" {
			return true, true
		}
		if t == "false" {
			return false, true
		}
	}
	return false, false
}

func customFieldVisible(opts json.RawMessage, isActive bool) bool {
	if !isActive {
		return false
	}
	var o map[string]any
	if err := json.Unmarshal(opts, &o); err != nil || o == nil {
		return true
	}
	if v, ok := jsonBool(o["is_visible"]); ok {
		return v
	}
	return true
}

func mergeCustomFieldOptions(opts json.RawMessage, isVisible bool, placeholder string) json.RawMessage {
	var o map[string]any
	if len(opts) > 0 {
		_ = json.Unmarshal(opts, &o)
	}
	if o == nil {
		o = map[string]any{}
	}
	o["is_visible"] = isVisible
	ph := strings.TrimSpace(placeholder)
	if ph != "" {
		o["placeholder"] = ph
	} else {
		delete(o, "placeholder")
	}
	raw, _ := json.Marshal(o)
	return raw
}

func customSortOrder(displayOrder int) int {
	if displayOrder >= 1000 {
		return displayOrder - 1000
	}
	return displayOrder
}
