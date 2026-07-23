package copilot

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/helpassistant"
)

const (
	defaultPackToolsMaxBytes = 12_000
	defaultPackAttPerFile    = 3_000
	defaultPackAttTotal      = 6_000
	defaultPackSessionTail   = 4_000
)

// PackTools compresses tool results for the LLM: keep name/ok/denied/error/deep_links,
// strip empty noise, truncate Data with an explicit marker. Single packer — do not
// stack a second summarizer on the same blob.
func PackTools(tools []toolResult, maxBytes int) (packed string, unpackedBytes, packedBytes int) {
	if maxBytes <= 0 {
		maxBytes = defaultPackToolsMaxBytes
	}
	type packedTool struct {
		Name      string          `json:"name"`
		OK        bool            `json:"ok"`
		Denied    bool            `json:"denied,omitempty"`
		Error     string          `json:"error,omitempty"`
		Data      json.RawMessage `json:"data,omitempty"`
		DeepLinks []deepLink      `json:"deep_links,omitempty"`
		DraftType string          `json:"draft_type,omitempty"`
	}
	rawUnpacked, _ := json.Marshal(tools)
	unpackedBytes = len(rawUnpacked)

	out := make([]packedTool, 0, len(tools))
	remaining := maxBytes - 2 // []
	for i, t := range tools {
		pt := packedTool{
			Name:      t.Name,
			OK:        t.OK,
			Denied:    t.Denied,
			Error:     t.Error,
			DeepLinks: SanitizeDeepLinks(t.DeepLinks),
		}
		if t.ActionDraft != nil {
			pt.DraftType = t.ActionDraft.Type
		}
		left := len(tools) - i
		share := remaining / maxInt(1, left)
		if share < 200 {
			share = 200
		}
		if len(t.Data) > 0 {
			pt.Data = truncateRawJSON(compactJSON(t.Data), share)
		}
		probe := append(append([]packedTool{}, out...), pt)
		b, err := json.Marshal(probe)
		if err != nil {
			pt.Data = json.RawMessage(`{"_truncated":true}`)
			probe = append(append([]packedTool{}, out...), pt)
			b, _ = json.Marshal(probe)
		}
		if len(b) > maxBytes && len(out) > 0 {
			break
		}
		if len(b) > maxBytes {
			pt.Data = json.RawMessage(`{"_truncated":true}`)
			out = append(out, pt)
			break
		}
		out = append(out, pt)
		remaining = maxBytes - len(b)
		if remaining < 64 {
			break
		}
	}
	raw, _ := json.Marshal(out)
	packedBytes = len(raw)
	return string(raw), unpackedBytes, packedBytes
}

// truncateRawJSON keeps valid JSON under maxLen (replaces with a small truncated object if needed).
func truncateRawJSON(raw json.RawMessage, maxLen int) json.RawMessage {
	if maxLen < 48 {
		maxLen = 48
	}
	if len(raw) <= maxLen {
		return raw
	}
	preview := string(raw)
	if len(preview) > maxLen-40 {
		preview = preview[:maxLen-40]
	}
	wrapped, err := json.Marshal(map[string]any{
		"_truncated": true,
		"preview":    preview + "…[truncated]",
	})
	if err != nil {
		return json.RawMessage(`{"_truncated":true}`)
	}
	if len(wrapped) > maxLen {
		return json.RawMessage(`{"_truncated":true}`)
	}
	return wrapped
}

func compactJSON(raw json.RawMessage) json.RawMessage {
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		return raw
	}
	v = dropEmpty(v)
	b, err := json.Marshal(v)
	if err != nil {
		return raw
	}
	return b
}

func dropEmpty(v any) any {
	switch t := v.(type) {
	case map[string]any:
		out := make(map[string]any, len(t))
		for k, val := range t {
			cleaned := dropEmpty(val)
			if cleaned == nil {
				continue
			}
			if s, ok := cleaned.(string); ok && s == "" {
				continue
			}
			if arr, ok := cleaned.([]any); ok && len(arr) == 0 {
				continue
			}
			out[k] = cleaned
		}
		if len(out) == 0 {
			return nil
		}
		return out
	case []any:
		out := make([]any, 0, len(t))
		for _, item := range t {
			cleaned := dropEmpty(item)
			if cleaned == nil {
				continue
			}
			out = append(out, cleaned)
		}
		return out
	default:
		return v
	}
}

// PackAttachments hard-caps per-file and total text sent to the model.
func PackAttachments(atts []helpassistant.ComposeAttachment, maxPerFile, maxTotal int) []helpassistant.ComposeAttachment {
	if maxPerFile <= 0 {
		maxPerFile = defaultPackAttPerFile
	}
	if maxTotal <= 0 {
		maxTotal = defaultPackAttTotal
	}
	if len(atts) == 0 {
		return atts
	}
	out := make([]helpassistant.ComposeAttachment, 0, len(atts))
	total := 0
	for i, a := range atts {
		if i >= 4 || total >= maxTotal {
			break
		}
		text := a.Text
		remain := maxTotal - total
		limit := maxPerFile
		if remain < limit {
			limit = remain
		}
		if len(text) > limit {
			text = text[:limit] + "…[truncated]"
		}
		total += len(text)
		out = append(out, helpassistant.ComposeAttachment{Name: a.Name, Kind: a.Kind, Text: text})
	}
	return out
}

// PackSessionTail prepares a truncated history string for future multi-turn prompts.
func PackSessionTail(messages []string, maxChars int) string {
	if maxChars <= 0 {
		maxChars = defaultPackSessionTail
	}
	if len(messages) == 0 {
		return ""
	}
	var b strings.Builder
	for i := len(messages) - 1; i >= 0; i-- {
		line := strings.TrimSpace(messages[i])
		if line == "" {
			continue
		}
		candidate := line + "\n" + b.String()
		if len(candidate) > maxChars {
			if b.Len() == 0 {
				return line[:maxChars] + "…[truncated]"
			}
			break
		}
		b.Reset()
		b.WriteString(candidate)
	}
	return strings.TrimSpace(b.String())
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// FormatPackAudit returns a short debug string for audit/logs.
func FormatPackAudit(unpacked, packed int) string {
	return fmt.Sprintf("pack_bytes=%d unpacked_bytes=%d", packed, unpacked)
}
