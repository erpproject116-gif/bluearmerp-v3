package helpassistant

import (
	"os"
	"strings"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/dashscope"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/llm"
)

const defaultHelpModel = "qwen-plus"

// Config controls optional DashScope grounding for Help Assistant answers.
type Config struct {
	Enabled bool
	APIKey  string
	BaseURL string
	Model   string
}

func ConfigFromEnv() Config {
	key := strings.TrimSpace(os.Getenv("DASHSCOPE_API_KEY"))
	enabled := parseEnvBoolDefault(os.Getenv("HELP_AI_ENABLED"), key != "")
	model := strings.TrimSpace(os.Getenv("HELP_AI_MODEL"))
	if model == "" {
		model = strings.TrimSpace(os.Getenv("QWEN_CHAT_MODEL"))
	}
	if model == "" {
		model = defaultHelpModel
	}
	return Config{
		Enabled: enabled,
		APIKey:  key,
		BaseURL: dashscope.NormalizeBaseURL(envOrDefault("DASHSCOPE_BASE_URL", dashscope.DefaultBaseURL)),
		Model:   model,
	}
}

func (c Config) Available() bool {
	return c.Enabled && c.APIKey != ""
}

func (c Config) newLLMClient() llm.Client {
	client := dashscope.NewClient(c.APIKey)
	client.BaseURL = c.BaseURL
	return client
}

func envOrDefault(v, fallback string) string {
	v = strings.TrimSpace(v)
	if v == "" {
		return fallback
	}
	return v
}

func parseEnvBoolDefault(raw string, def bool) bool {
	raw = strings.TrimSpace(strings.ToLower(raw))
	switch raw {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return def
	}
}
