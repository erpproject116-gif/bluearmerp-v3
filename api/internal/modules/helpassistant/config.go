package helpassistant

import (
	"os"
	"strconv"
	"strings"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/dashscope"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/llm"
)

const (
	defaultSmallModel  = "qwen-flash"
	defaultMediumModel = "qwen-plus"
	defaultDailyCap    = int64(500_000)
)

// Config controls optional DashScope grounding for Help Assistant / Copilot.
type Config struct {
	Enabled     bool
	CopilotOn   bool
	APIKey      string
	BaseURL     string
	Model       string // HELP_AI_MODEL / small-model default for compose
	SmallModel  string
	MediumModel string
	DailyCap    int64
}

func ConfigFromEnv() Config {
	key := strings.TrimSpace(os.Getenv("DASHSCOPE_API_KEY"))
	enabled := parseEnvBoolDefault(os.Getenv("HELP_AI_ENABLED"), key != "")
	copilotOn := parseEnvBoolDefault(os.Getenv("COPILOT_ENABLED"), enabled)

	small := firstNonEmpty(
		os.Getenv("COPILOT_SMALL_MODEL"),
		os.Getenv("HELP_AI_MODEL"),
		os.Getenv("QWEN_CHAT_MODEL"),
		defaultSmallModel,
	)
	medium := firstNonEmpty(os.Getenv("COPILOT_MEDIUM_MODEL"), defaultMediumModel)
	model := firstNonEmpty(os.Getenv("HELP_AI_MODEL"), small)

	capTokens := defaultDailyCap
	if raw := strings.TrimSpace(os.Getenv("COPILOT_DAILY_TOKEN_CAP")); raw != "" {
		if n, err := strconv.ParseInt(raw, 10, 64); err == nil && n > 0 {
			capTokens = n
		}
	}

	return Config{
		Enabled:     enabled,
		CopilotOn:   copilotOn,
		APIKey:      key,
		BaseURL:     dashscope.NormalizeBaseURL(envOrDefault("DASHSCOPE_BASE_URL", dashscope.DefaultBaseURL)),
		Model:       model,
		SmallModel:  small,
		MediumModel: medium,
		DailyCap:    capTokens,
	}
}

func (c Config) Available() bool {
	return c.Enabled && c.APIKey != ""
}

func (c Config) CopilotAvailable() bool {
	return c.CopilotOn && c.APIKey != ""
}

func (c Config) newLLMClient() llm.Client {
	client := dashscope.NewClient(c.APIKey)
	client.BaseURL = c.BaseURL
	return client
}

// NewDashScopeClient returns a DashScope client for compose / copilot.
func (c Config) NewDashScopeClient() dashscope.Client {
	return c.newDashScopeClient()
}

func (c Config) newDashScopeClient() dashscope.Client {
	client := dashscope.NewClient(c.APIKey)
	client.BaseURL = c.BaseURL
	return client
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		v = strings.TrimSpace(v)
		if v != "" {
			return v
		}
	}
	return ""
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
