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
}

type IndustryWorkItem struct {
	Title               string `json:"title"`
	ColumnKey           string `json:"column_key"`
	Priority            string `json:"priority"`
	StartDateOffsetDays int    `json:"start_date_offset_days"`
	EndDateOffsetDays   int    `json:"end_date_offset_days"`
}

type IndustryAutomationRule struct {
	RuleName       string         `json:"rule_name"`
	TriggerEvent   string         `json:"trigger_event"`
	TriggerConfig  map[string]any `json:"trigger_config"`
	ActionType     string         `json:"action_type"`
	ActionConfig   map[string]any `json:"action_config"`
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
	PackCode           string                    `json:"pack_code"`
	PackName           string                    `json:"pack_name"`
	Columns            []IndustryColumn          `json:"columns"`
	SampleWorkItems    []IndustryWorkItem        `json:"sample_work_items"`
	AutomationRules    []IndustryAutomationRule  `json:"automation_rules"`
	DashboardWidgets   []IndustryDashboardWidget `json:"dashboard_widgets"`
}

func loadIndustryPack(code string) (IndustryPack, error) {
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
	return pack, nil
}

func listIndustryPacks() []map[string]string {
	return []map[string]string{
		{"pack_code": "general", "pack_name": "General SME"},
		{"pack_code": "construction", "pack_name": "Construction"},
		{"pack_code": "professional_services", "pack_name": "Professional Services"},
		{"pack_code": "warehouse", "pack_name": "Warehouse / Logistics"},
		{"pack_code": "job_shop", "pack_name": "Engineering / Job Shop"},
	}
}

func offsetDate(days int) *time.Time {
	d := time.Now().UTC().AddDate(0, 0, days)
	return &d
}
