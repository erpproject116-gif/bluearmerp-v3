package operations

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"time"
)

//go:embed packs/construction.json
var constructionPackJSON []byte

//go:embed packs/general.json
var generalPackJSON []byte

//go:embed packs/professional_services.json
var professionalServicesPackJSON []byte

//go:embed packs/warehouse.json
var warehousePackJSON []byte

//go:embed packs/job_shop.json
var jobShopPackJSON []byte

type IndustryColumn struct {
	Key       string `json:"key"`
	Name      string `json:"name"`
	SortOrder int    `json:"sort_order"`
	Color     string `json:"color"`
	IsDone    bool   `json:"is_done"`
	WipLimit  *int   `json:"wip_limit,omitempty"`
}

type IndustryWorkItem struct {
	Title               string `json:"title"`
	ColumnKey           string `json:"column_key"`
	Priority            string `json:"priority"`
	StartDateOffsetDays int    `json:"start_date_offset_days"`
	EndDateOffsetDays   int    `json:"end_date_offset_days"`
}

type IndustryAutomationRule struct {
	RuleName      string         `json:"rule_name"`
	TriggerEvent  string         `json:"trigger_event"`
	TriggerConfig map[string]any `json:"trigger_config"`
	ActionType    string         `json:"action_type"`
	ActionConfig  map[string]any `json:"action_config"`
}

type IndustryDashboardWidget struct {
	WidgetType string         `json:"widget_type"`
	Title      string         `json:"title"`
	GridX      int            `json:"grid_x"`
	GridY      int            `json:"grid_y"`
	GridW      int            `json:"grid_w"`
	GridH      int            `json:"grid_h"`
	SortOrder  int            `json:"sort_order"`
	Config     map[string]any `json:"config"`
}

type IndustryPack struct {
	ID               int64                     `json:"id,omitempty"`
	PackCode         string                    `json:"pack_code"`
	PackName         string                    `json:"pack_name"`
	Description      string                    `json:"description,omitempty"`
	IsSystem         bool                      `json:"is_system,omitempty"`
	TenantID         *int64                    `json:"tenant_id,omitempty"`
	Columns          []IndustryColumn          `json:"columns"`
	SampleWorkItems  []IndustryWorkItem        `json:"sample_work_items"`
	AutomationRules  []IndustryAutomationRule  `json:"automation_rules"`
	DashboardWidgets []IndustryDashboardWidget `json:"dashboard_widgets"`
}

var embedPackCodesList = []string{"general", "construction", "professional_services", "warehouse", "job_shop"}

func embedPackCodes() []string {
	return embedPackCodesList
}

func loadEmbedPack(code string) (IndustryPack, error) {
	var raw []byte
	switch code {
	case "construction":
		raw = constructionPackJSON
	case "general":
		raw = generalPackJSON
	case "professional_services":
		raw = professionalServicesPackJSON
	case "warehouse":
		raw = warehousePackJSON
	case "job_shop":
		raw = jobShopPackJSON
	default:
		return IndustryPack{}, fmt.Errorf("unknown industry pack: %s", code)
	}
	var pack IndustryPack
	if err := json.Unmarshal(raw, &pack); err != nil {
		return IndustryPack{}, err
	}
	for i := range pack.Columns {
		if !pack.Columns[i].IsDone {
			k := pack.Columns[i].Key
			pack.Columns[i].IsDone = k == "done" || k == "closed" || k == "complete" || k == "completed"
		}
	}
	pack.IsSystem = true
	return pack, nil
}

// loadIndustryPack keeps backward compatibility for callers that only know embed codes.
func loadIndustryPack(code string) (IndustryPack, error) {
	return loadEmbedPack(code)
}

func listIndustryPacks() []map[string]string {
	codes := embedPackCodes()
	out := make([]map[string]string, 0, len(codes))
	for _, code := range codes {
		pack, err := loadEmbedPack(code)
		if err != nil {
			continue
		}
		summary := fmt.Sprintf("%d Kanban columns", len(pack.Columns))
		if n := len(pack.SampleWorkItems); n > 0 {
			summary += fmt.Sprintf(", %d starter tasks", n)
		}
		if len(pack.DashboardWidgets) > 0 {
			summary += ", dashboard widgets"
		}
		if len(pack.AutomationRules) > 0 {
			summary += ", automation rules"
		}
		out = append(out, map[string]string{
			"pack_code": pack.PackCode,
			"pack_name": pack.PackName,
			"summary":   summary,
		})
	}
	return out
}

func offsetDate(days int) *time.Time {
	d := time.Now().UTC().AddDate(0, 0, days)
	return &d
}
