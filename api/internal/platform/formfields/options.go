package formfields

import "encoding/json"

func customFieldVisible(opts json.RawMessage, isActive bool) bool {
	if !isActive {
		return false
	}
	var o map[string]any
	if err := json.Unmarshal(opts, &o); err != nil || o == nil {
		return true
	}
	if v, ok := o["is_visible"].(bool); ok {
		return v
	}
	return true
}

func mergeCustomFieldOptions(opts json.RawMessage, isVisible bool) json.RawMessage {
	var o map[string]any
	if len(opts) > 0 {
		_ = json.Unmarshal(opts, &o)
	}
	if o == nil {
		o = map[string]any{}
	}
	o["is_visible"] = isVisible
	raw, _ := json.Marshal(o)
	return raw
}

func customSortOrder(displayOrder int) int {
	if displayOrder >= 1000 {
		return displayOrder - 1000
	}
	return displayOrder
}
